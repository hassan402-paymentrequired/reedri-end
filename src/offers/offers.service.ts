import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { JobsOptions, Queue } from 'bullmq';
import { OfferStatus, RideRequestStatus, TripStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OFFER_EXPIRY_QUEUE, OfferExpiryJob } from '../queues/queue-names';
import {
  DomainEvent,
  OfferAcceptedEvent,
  OfferSubmittedEvent,
} from '../common/events/domain-events';

// Both job handlers re-check status before mutating (see expireIfStillPending /
// expireAllPendingOffersForDriver), so retrying a failed attempt is safe.
const JOB_RETRY_OPTIONS: Pick<JobsOptions, 'attempts' | 'backoff'> = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
};

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    @InjectQueue(OFFER_EXPIRY_QUEUE) private readonly offerExpiryQueue: Queue,
  ) {}

  async submitOffer(
    driverUserId: string,
    rideRequestId: string,
    offeredFare: number,
  ) {
    const driverProfile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverUserId },
    });
    if (!driverProfile) {
      throw new NotFoundException('Driver profile not found');
    }

    const rideRequest = await this.prisma.rideRequest.findUnique({
      where: { id: rideRequestId },
    });
    if (!rideRequest) {
      throw new NotFoundException('Ride request not found');
    }
    if (rideRequest.status !== RideRequestStatus.PENDING) {
      throw new BadRequestException(
        'Ride request is no longer accepting offers',
      );
    }

    const offer = await this.prisma.rideOffer.upsert({
      where: {
        rideRequestId_driverId: { rideRequestId, driverId: driverProfile.id },
      },
      create: {
        rideRequestId,
        driverId: driverProfile.id,
        offeredFare,
        status: OfferStatus.PENDING,
      },
      update: {
        offeredFare,
        status: OfferStatus.PENDING,
      },
    });

    await this.scheduleExpiry(offer.id);

    this.events.emit(
      DomainEvent.OfferSubmitted,
      new OfferSubmittedEvent(offer, rideRequest.riderId),
    );
    return offer;
  }

  async acceptOffer(riderId: string, offerId: string) {
    const offer = await this.prisma.rideOffer.findUnique({
      where: { id: offerId },
      include: {
        rideRequest: true,
        driver: { include: { user: { select: { id: true } } } },
      },
    });
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }
    if (offer.rideRequest.riderId !== riderId) {
      throw new ForbiddenException();
    }
    if (
      offer.rideRequest.status !== RideRequestStatus.PENDING ||
      offer.status !== OfferStatus.PENDING
    ) {
      throw new BadRequestException('Offer can no longer be accepted');
    }

    const otherPendingOffers = await this.prisma.rideOffer.findMany({
      where: {
        rideRequestId: offer.rideRequestId,
        status: OfferStatus.PENDING,
        id: { not: offer.id },
      },
      include: { driver: { include: { user: { select: { id: true } } } } },
    });

    const [, , , trip] = await this.prisma.$transaction([
      this.prisma.rideOffer.update({
        where: { id: offer.id },
        data: { status: OfferStatus.ACCEPTED },
      }),
      this.prisma.rideOffer.updateMany({
        where: {
          rideRequestId: offer.rideRequestId,
          status: OfferStatus.PENDING,
          id: { not: offer.id },
        },
        data: { status: OfferStatus.EXPIRED },
      }),
      this.prisma.rideRequest.update({
        where: { id: offer.rideRequestId },
        data: { status: RideRequestStatus.MATCHED },
      }),
      this.prisma.trip.create({
        data: {
          rideRequestId: offer.rideRequestId,
          driverId: offer.driver.user.id,
          riderId,
          agreedFare: offer.offeredFare,
          status: TripStatus.MATCHED,
        },
      }),
    ]);

    await Promise.all(
      [offer, ...otherPendingOffers].map((o) =>
        this.cancelScheduledExpiry(o.id),
      ),
    );

    const updatedRideRequest = {
      ...offer.rideRequest,
      status: RideRequestStatus.MATCHED,
    };
    this.events.emit(
      DomainEvent.OfferAccepted,
      new OfferAcceptedEvent(
        updatedRideRequest,
        trip,
        { ...offer, status: OfferStatus.ACCEPTED },
        otherPendingOffers.map((o) => o.driver.user.id),
      ),
    );

    return trip;
  }

  /**
   * Called by OfferExpiryProcessor when a delayed expiry job fires.
   * Defensive status check: the offer may have already been accepted/rejected
   * by the time the job runs.
   */
  async expireIfStillPending(
    offerId: string,
  ): Promise<{ rideRequestId: string; driverUserId: string } | null> {
    const offer = await this.prisma.rideOffer.findUnique({
      where: { id: offerId },
      include: { driver: { include: { user: { select: { id: true } } } } },
    });
    if (!offer || offer.status !== OfferStatus.PENDING) {
      return null;
    }
    await this.prisma.rideOffer.update({
      where: { id: offerId },
      data: { status: OfferStatus.EXPIRED },
    });
    return {
      rideRequestId: offer.rideRequestId,
      driverUserId: offer.driver.user.id,
    };
  }

  /**
   * Called when a driver disconnects/goes offline mid-negotiation. Expires
   * only offers still pending after the grace period elapses (handled by the
   * scheduled job checking driver.isOnline at run time).
   */
  async expireAllPendingOffersForDriver(
    driverProfileId: string,
  ): Promise<void> {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
    });
    if (!driver || driver.isOnline) {
      // Reconnected before the grace period elapsed — leave their offers alone.
      return;
    }
    await this.prisma.rideOffer.updateMany({
      where: { driverId: driverProfileId, status: OfferStatus.PENDING },
      data: { status: OfferStatus.EXPIRED },
    });
  }

  async scheduleDriverOfferExpiry(driverProfileId: string): Promise<void> {
    const delaySeconds = this.config.get<number>('OFFER_EXPIRY_SECONDS', 60);
    await this.offerExpiryQueue.add(
      OfferExpiryJob.ExpireDriverPendingOffers,
      { driverProfileId },
      {
        delay: delaySeconds * 1000,
        jobId: `driver-disconnect-${driverProfileId}`,
        ...JOB_RETRY_OPTIONS,
      },
    );
  }

  private async scheduleExpiry(offerId: string): Promise<void> {
    const delaySeconds = this.config.get<number>('OFFER_EXPIRY_SECONDS', 60);
    await this.cancelScheduledExpiry(offerId);
    await this.offerExpiryQueue.add(
      OfferExpiryJob.ExpireOffer,
      { offerId },
      {
        delay: delaySeconds * 1000,
        jobId: `offer-${offerId}`,
        ...JOB_RETRY_OPTIONS,
      },
    );
  }

  private async cancelScheduledExpiry(offerId: string): Promise<void> {
    const job = await this.offerExpiryQueue.getJob(`offer-${offerId}`);
    if (job) {
      await job.remove().catch(() => undefined);
    }
  }
}
