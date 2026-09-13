import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { OfferStatus, RideRequestStatus, TripStatus } from '@prisma/client';
import { OffersService } from './offers.service';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEvent } from '../common/events/domain-events';

describe('OffersService', () => {
  const driverProfile = {
    id: 'driver-profile-1',
    userId: 'driver-user-1',
    isOnline: true,
  };
  const pendingRideRequest = {
    id: 'rr-1',
    riderId: 'rider-1',
    status: RideRequestStatus.PENDING,
  };

  function buildService(prismaOverrides: Record<string, unknown> = {}) {
    const queue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<Queue>;

    const prisma = {
      driverProfile: { findUnique: jest.fn().mockResolvedValue(driverProfile) },
      rideRequest: {
        findUnique: jest.fn().mockResolvedValue(pendingRideRequest),
        update: jest.fn().mockResolvedValue({}),
      },
      rideOffer: {
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 'offer-1', offeredFare: 1500 }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      trip: { create: jest.fn().mockResolvedValue({ id: 'trip-1' }) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      ...prismaOverrides,
    } as unknown as PrismaService;

    const config = {
      get: jest.fn().mockReturnValue(60),
    } as unknown as ConfigService;
    const events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    return {
      service: new OffersService(prisma, config, events, queue),
      prisma,
      queue,
      events,
    };
  }

  describe('submitOffer', () => {
    it('throws NotFoundException when the driver has no profile', async () => {
      const { service, prisma } = buildService();
      (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.submitOffer('driver-user-1', 'rr-1', 1500),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the ride request does not exist', async () => {
      const { service, prisma } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.submitOffer('driver-user-1', 'rr-1', 1500),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the ride request is no longer pending', async () => {
      const { service, prisma } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue({
        ...pendingRideRequest,
        status: RideRequestStatus.MATCHED,
      });
      await expect(
        service.submitOffer('driver-user-1', 'rr-1', 1500),
      ).rejects.toThrow(BadRequestException);
    });

    it('upserts the offer, schedules an expiry job, and emits OfferSubmitted', async () => {
      const { service, prisma, queue, events } = buildService();
      const offer = await service.submitOffer('driver-user-1', 'rr-1', 1500);

      expect(offer).toEqual({ id: 'offer-1', offeredFare: 1500 });
      expect(prisma.rideOffer.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            rideRequestId_driverId: {
              rideRequestId: 'rr-1',
              driverId: 'driver-profile-1',
            },
          },
        }),
      );
      expect(queue.add).toHaveBeenCalledWith(
        'expire-offer',
        { offerId: 'offer-1' },
        expect.objectContaining({ jobId: 'offer-offer-1', delay: 60000 }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        DomainEvent.OfferSubmitted,
        expect.objectContaining({ riderId: 'rider-1' }),
      );
    });
  });

  describe('acceptOffer', () => {
    const offerWithRelations = {
      id: 'offer-1',
      rideRequestId: 'rr-1',
      offeredFare: 1500,
      status: OfferStatus.PENDING,
      rideRequest: pendingRideRequest,
      driver: { user: { id: 'driver-user-1' } },
    };

    it('throws NotFoundException when the offer does not exist', async () => {
      const { service, prisma } = buildService();
      (prisma.rideOffer.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.acceptOffer('rider-1', 'offer-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('never selects more than the driver user id — a password hash must not be pulled into memory', async () => {
      const { service, prisma } = buildService();
      (prisma.rideOffer.findUnique as jest.Mock).mockResolvedValue(
        offerWithRelations,
      );
      await service.acceptOffer('rider-1', 'offer-1');
      const findUniqueCall = (prisma.rideOffer.findUnique as jest.Mock).mock
        .calls[0][0] as { include: { driver: { include: { user: unknown } } } };
      expect(findUniqueCall.include.driver.include.user).toEqual({
        select: { id: true },
      });
    });

    it('throws ForbiddenException when the requester is not the ride request owner', async () => {
      const { service, prisma } = buildService();
      (prisma.rideOffer.findUnique as jest.Mock).mockResolvedValue(
        offerWithRelations,
      );
      await expect(
        service.acceptOffer('someone-else', 'offer-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when the offer is no longer pending', async () => {
      const { service, prisma } = buildService();
      (prisma.rideOffer.findUnique as jest.Mock).mockResolvedValue({
        ...offerWithRelations,
        status: OfferStatus.EXPIRED,
      });
      await expect(service.acceptOffer('rider-1', 'offer-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates a trip, cancels the scheduled expiry, and emits OfferAccepted on success', async () => {
      const { service, prisma, queue, events } = buildService();
      (prisma.rideOffer.findUnique as jest.Mock).mockResolvedValue(
        offerWithRelations,
      );

      const trip = await service.acceptOffer('rider-1', 'offer-1');

      expect(trip).toEqual({ id: 'trip-1' });
      const tripCreateCall = (prisma.trip.create as jest.Mock).mock
        .calls[0][0] as {
        data: {
          driverId: string;
          riderId: string;
          agreedFare: number;
          status: TripStatus;
        };
      };
      expect(tripCreateCall.data).toEqual({
        rideRequestId: 'rr-1',
        driverId: 'driver-user-1',
        riderId: 'rider-1',
        agreedFare: 1500,
        status: TripStatus.MATCHED,
      });
      expect(queue.getJob).toHaveBeenCalledWith('offer-offer-1');
      expect(events.emit).toHaveBeenCalledWith(
        DomainEvent.OfferAccepted,
        expect.objectContaining({ trip: { id: 'trip-1' } }),
      );
    });
  });

  describe('expireIfStillPending', () => {
    it('returns null and does nothing if the offer is no longer pending', async () => {
      const { service, prisma } = buildService();
      (prisma.rideOffer.findUnique as jest.Mock).mockResolvedValue({
        status: OfferStatus.ACCEPTED,
      });
      const result = await service.expireIfStillPending('offer-1');
      expect(result).toBeNull();
      expect(prisma.rideOffer.update).not.toHaveBeenCalled();
    });

    it('expires the offer if still pending', async () => {
      const { service, prisma } = buildService();
      (prisma.rideOffer.findUnique as jest.Mock).mockResolvedValue({
        status: OfferStatus.PENDING,
        rideRequestId: 'rr-1',
        driver: { user: { id: 'driver-user-1' } },
      });
      const result = await service.expireIfStillPending('offer-1');
      expect(result).toEqual({
        rideRequestId: 'rr-1',
        driverUserId: 'driver-user-1',
      });
      expect(prisma.rideOffer.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: OfferStatus.EXPIRED } }),
      );
    });
  });

  describe('expireAllPendingOffersForDriver', () => {
    it('does nothing if the driver reconnected before the grace period elapsed', async () => {
      const { service, prisma } = buildService();
      (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue({
        isOnline: true,
      });
      await service.expireAllPendingOffersForDriver('driver-profile-1');
      expect(prisma.rideOffer.updateMany).not.toHaveBeenCalled();
    });

    it('expires pending offers if the driver is still offline', async () => {
      const { service, prisma } = buildService();
      (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue({
        isOnline: false,
      });
      await service.expireAllPendingOffersForDriver('driver-profile-1');
      expect(prisma.rideOffer.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { driverId: 'driver-profile-1', status: OfferStatus.PENDING },
        }),
      );
    });
  });
});
