import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role, RideRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { CreateRideRequestDto } from './dto/create-ride-request.dto';
import {
  DomainEvent,
  RideRequestCancelledEvent,
  RideRequestCreatedEvent,
} from '../common/events/domain-events';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

const RIDE_REQUEST_WITH_OFFERS = {
  offers: {
    include: {
      driver: {
        include: { user: { select: { id: true, name: true, rating: true } } },
      },
    },
  },
  trip: true,
} as const;

@Injectable()
export class RideRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: MatchingService,
    private readonly events: EventEmitter2,
  ) {}

  async create(riderId: string, dto: CreateRideRequestDto) {
    const rideRequest = await this.prisma.rideRequest.create({
      data: {
        riderId,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        suggestedFare: dto.suggestedFare,
      },
    });

    const nearbyDrivers = await this.matchingService.findNearbyDrivers(
      dto.pickupLat,
      dto.pickupLng,
    );

    this.events.emit(
      DomainEvent.RideRequestCreated,
      new RideRequestCreatedEvent(
        rideRequest,
        nearbyDrivers.map((d) => d.userId),
      ),
    );

    return { ...rideRequest, nearbyDriverCount: nearbyDrivers.length };
  }

  async findOneForUser(id: string, requester: AuthenticatedUser) {
    const rideRequest = await this.prisma.rideRequest.findUnique({
      where: { id },
      include: RIDE_REQUEST_WITH_OFFERS,
    });
    if (!rideRequest) {
      throw new NotFoundException('Ride request not found');
    }
    this.assertCanView(rideRequest, requester);
    return rideRequest;
  }

  async cancel(id: string, requester: AuthenticatedUser, reason?: string) {
    const rideRequest = await this.prisma.rideRequest.findUnique({
      where: { id },
      include: RIDE_REQUEST_WITH_OFFERS,
    });
    if (!rideRequest) {
      throw new NotFoundException('Ride request not found');
    }
    this.assertCanCancel(rideRequest, requester);

    if (
      rideRequest.status !== RideRequestStatus.PENDING &&
      rideRequest.status !== RideRequestStatus.MATCHED
    ) {
      throw new BadRequestException('Ride request can no longer be cancelled');
    }

    const affectedDriverUserIds = rideRequest.offers
      .filter((o) => o.status === 'PENDING')
      .map((o) => o.driver.user.id);

    const [updated] = await this.prisma.$transaction([
      this.prisma.rideRequest.update({
        where: { id },
        data: {
          status: RideRequestStatus.CANCELLED,
          cancelReason: reason,
          cancelledAt: new Date(),
        },
      }),
      this.prisma.rideOffer.updateMany({
        where: { rideRequestId: id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      }),
      ...(rideRequest.trip
        ? [
            this.prisma.trip.update({
              where: { id: rideRequest.trip.id },
              data: { status: 'CANCELLED', cancelReason: reason },
            }),
          ]
        : []),
    ]);

    this.events.emit(
      DomainEvent.RideRequestCancelled,
      new RideRequestCancelledEvent(updated, affectedDriverUserIds),
    );

    return updated;
  }

  private assertCanView(
    rideRequest: {
      riderId: string;
      offers: { driver: { user: { id: string } } }[];
      trip: { driverId: string } | null;
    },
    requester: AuthenticatedUser,
  ): void {
    if (requester.role === Role.RIDER) {
      if (rideRequest.riderId !== requester.userId) {
        throw new ForbiddenException();
      }
      return;
    }
    const isOfferingDriver = rideRequest.offers.some(
      (o) => o.driver.user.id === requester.userId,
    );
    const isMatchedDriver = rideRequest.trip?.driverId === requester.userId;
    if (!isOfferingDriver && !isMatchedDriver) {
      throw new ForbiddenException();
    }
  }

  private assertCanCancel(
    rideRequest: { riderId: string; trip: { driverId: string } | null },
    requester: AuthenticatedUser,
  ): void {
    const isOwnerRider =
      requester.role === Role.RIDER && rideRequest.riderId === requester.userId;
    const isMatchedDriver =
      requester.role === Role.DRIVER &&
      rideRequest.trip?.driverId === requester.userId;
    if (!isOwnerRider && !isMatchedDriver) {
      throw new ForbiddenException();
    }
  }
}
