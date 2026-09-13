import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role, RideRequestStatus } from '@prisma/client';
import { RideRequestsService } from './ride-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { DomainEvent } from '../common/events/domain-events';

describe('RideRequestsService', () => {
  const dto = {
    pickupLat: 6.5244,
    pickupLng: 3.3792,
    dropoffLat: 6.6018,
    dropoffLng: 3.3515,
    suggestedFare: 1500,
  };

  function buildService(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      rideRequest: {
        create: jest.fn().mockResolvedValue({ id: 'rr-1', riderId: 'rider-1' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({
          id: 'rr-1',
          status: RideRequestStatus.CANCELLED,
        }),
      },
      rideOffer: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      trip: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      ...prismaOverrides,
    } as unknown as PrismaService;

    const matchingService = {
      findNearbyDrivers: jest
        .fn()
        .mockResolvedValue([
          { driverId: 'dp1', userId: 'driver-user-1', distanceMeters: 100 },
        ]),
    } as unknown as jest.Mocked<MatchingService>;

    const events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    return {
      service: new RideRequestsService(prisma, matchingService, events),
      prisma,
      matchingService,
      events,
    };
  }

  describe('create', () => {
    it('creates the ride request, finds nearby drivers, and emits RideRequestCreated', async () => {
      const { service, events } = buildService();
      const result = await service.create('rider-1', dto);

      expect(result).toEqual(
        expect.objectContaining({
          id: 'rr-1',
          riderId: 'rider-1',
          nearbyDriverCount: 1,
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        DomainEvent.RideRequestCreated,
        expect.objectContaining({ nearbyDriverUserIds: ['driver-user-1'] }),
      );
    });
  });

  describe('findOneForUser', () => {
    const baseRideRequest = {
      riderId: 'rider-1',
      offers: [{ driver: { user: { id: 'offering-driver' } } }],
      trip: null,
    };

    it('throws NotFoundException when the ride request does not exist', async () => {
      const { service, prisma } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.findOneForUser('missing', {
          userId: 'rider-1',
          role: Role.RIDER,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows the owning rider to view it', async () => {
      const { service, prisma } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue(
        baseRideRequest,
      );
      await expect(
        service.findOneForUser('rr-1', { userId: 'rider-1', role: Role.RIDER }),
      ).resolves.toBeDefined();
    });

    it('flattens each offer to the driver identity, dropping the driver profile wrapper', async () => {
      const { service, prisma } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue({
        ...baseRideRequest,
        offers: [
          {
            id: 'offer-1',
            offeredFare: 1200,
            status: 'PENDING',
            createdAt: new Date('2024-01-01'),
            driver: {
              id: 'driver-profile-1',
              vehicleMake: 'Toyota',
              user: { id: 'offering-driver', name: 'Ada', rating: 4.8 },
            },
          },
        ],
      });
      const result = await service.findOneForUser('rr-1', {
        userId: 'rider-1',
        role: Role.RIDER,
      });
      expect(result.offers?.[0].driver).toEqual({
        id: 'offering-driver',
        name: 'Ada',
        rating: 4.8,
      });
    });

    it('forbids a rider who does not own the ride request', async () => {
      const { service, prisma } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue(
        baseRideRequest,
      );
      await expect(
        service.findOneForUser('rr-1', {
          userId: 'other-rider',
          role: Role.RIDER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a driver who has an offer on the ride request', async () => {
      const { service, prisma } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue(
        baseRideRequest,
      );
      await expect(
        service.findOneForUser('rr-1', {
          userId: 'offering-driver',
          role: Role.DRIVER,
        }),
      ).resolves.toBeDefined();
    });

    it('allows the matched driver even without a pending offer entry', async () => {
      const { service, prisma } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue({
        ...baseRideRequest,
        offers: [],
        trip: { driverId: 'matched-driver' },
      });
      await expect(
        service.findOneForUser('rr-1', {
          userId: 'matched-driver',
          role: Role.DRIVER,
        }),
      ).resolves.toBeDefined();
    });

    it('forbids an unrelated driver', async () => {
      const { service, prisma } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue(
        baseRideRequest,
      );
      await expect(
        service.findOneForUser('rr-1', {
          userId: 'stranger-driver',
          role: Role.DRIVER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancel', () => {
    const pendingRideRequest = {
      id: 'rr-1',
      riderId: 'rider-1',
      status: RideRequestStatus.PENDING,
      offers: [{ status: 'PENDING', driver: { user: { id: 'driver-1' } } }],
      trip: null,
    };

    it('throws NotFoundException when the ride request does not exist', async () => {
      const { service, prisma } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.cancel('missing', { userId: 'rider-1', role: Role.RIDER }),
      ).rejects.toThrow(NotFoundException);
    });

    it('forbids a rider who does not own the ride request', async () => {
      const { service, prisma } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue(
        pendingRideRequest,
      );
      await expect(
        service.cancel('rr-1', { userId: 'other-rider', role: Role.RIDER }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cancelling an already-completed ride request', async () => {
      const { service, prisma } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue({
        ...pendingRideRequest,
        status: RideRequestStatus.COMPLETED,
      });
      await expect(
        service.cancel('rr-1', { userId: 'rider-1', role: Role.RIDER }),
      ).rejects.toThrow(BadRequestException);
    });

    it('cancels a pending ride request and emits with only pending offer driver ids', async () => {
      const { service, prisma, events } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue({
        ...pendingRideRequest,
        offers: [
          { status: 'PENDING', driver: { user: { id: 'driver-1' } } },
          { status: 'EXPIRED', driver: { user: { id: 'driver-2' } } },
        ],
      });

      await service.cancel(
        'rr-1',
        { userId: 'rider-1', role: Role.RIDER },
        'changed my mind',
      );

      expect(events.emit).toHaveBeenCalledWith(
        DomainEvent.RideRequestCancelled,
        expect.objectContaining({ affectedDriverUserIds: ['driver-1'] }),
      );
    });

    it('allows the matched driver to cancel', async () => {
      const { service, prisma } = buildService();
      (prisma.rideRequest.findUnique as jest.Mock).mockResolvedValue({
        ...pendingRideRequest,
        status: RideRequestStatus.MATCHED,
        trip: { id: 'trip-1', driverId: 'driver-user-1' },
      });
      await expect(
        service.cancel('rr-1', { userId: 'driver-user-1', role: Role.DRIVER }),
      ).resolves.toBeDefined();
    });
  });
});
