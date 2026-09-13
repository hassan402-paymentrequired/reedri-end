import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TripStatus } from '@prisma/client';
import { TripsService } from './trips.service';
import { PrismaService } from '../prisma/prisma.service';
import { DomainEvent } from '../common/events/domain-events';

describe('TripsService', () => {
  const matchedTrip = {
    id: 'trip-1',
    rideRequestId: 'rr-1',
    driverId: 'driver-user-1',
    status: TripStatus.MATCHED,
  };

  function buildService(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue(matchedTrip),
        update: jest.fn().mockResolvedValue({}),
      },
      rideRequest: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      ...prismaOverrides,
    } as unknown as PrismaService;

    const events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    return { service: new TripsService(prisma, events), prisma, events };
  }

  describe('start', () => {
    it('throws NotFoundException when the trip does not exist', async () => {
      const { service, prisma } = buildService();
      (prisma.trip.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.start('trip-1', 'driver-user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the requester is not the assigned driver', async () => {
      const { service } = buildService();
      await expect(service.start('trip-1', 'someone-else')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException when the trip is not in MATCHED status', async () => {
      const { service, prisma } = buildService();
      (prisma.trip.findUnique as jest.Mock).mockResolvedValue({
        ...matchedTrip,
        status: TripStatus.STARTED,
      });
      await expect(service.start('trip-1', 'driver-user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('transitions the trip to STARTED and the ride request to IN_PROGRESS', async () => {
      const { service, prisma, events } = buildService();
      (prisma.trip.update as jest.Mock).mockResolvedValue({
        ...matchedTrip,
        status: TripStatus.STARTED,
      });

      await service.start('trip-1', 'driver-user-1');

      const tripUpdateCall = (prisma.trip.update as jest.Mock).mock
        .calls[0][0] as {
        data: { status: TripStatus };
      };
      expect(tripUpdateCall.data.status).toBe(TripStatus.STARTED);

      const rideRequestUpdateCall = (prisma.rideRequest.update as jest.Mock)
        .mock.calls[0][0] as {
        where: { id: string };
        data: { status: string };
      };
      expect(rideRequestUpdateCall.where).toEqual({ id: 'rr-1' });
      expect(rideRequestUpdateCall.data.status).toBe('IN_PROGRESS');
      expect(events.emit).toHaveBeenCalledWith(
        DomainEvent.TripStarted,
        expect.anything(),
      );
    });
  });

  describe('complete', () => {
    it('throws BadRequestException when the trip has not been started', async () => {
      const { service } = buildService();
      await expect(service.complete('trip-1', 'driver-user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('transitions the trip to COMPLETED and the ride request to COMPLETED', async () => {
      const { service, prisma, events } = buildService();
      (prisma.trip.findUnique as jest.Mock).mockResolvedValue({
        ...matchedTrip,
        status: TripStatus.STARTED,
      });
      (prisma.trip.update as jest.Mock).mockResolvedValue({
        ...matchedTrip,
        status: TripStatus.COMPLETED,
      });

      await service.complete('trip-1', 'driver-user-1');

      const rideRequestUpdateCall = (prisma.rideRequest.update as jest.Mock)
        .mock.calls[0][0] as {
        data: { status: string };
      };
      expect(rideRequestUpdateCall.data.status).toBe('COMPLETED');
      expect(events.emit).toHaveBeenCalledWith(
        DomainEvent.TripCompleted,
        expect.anything(),
      );
    });
  });
});
