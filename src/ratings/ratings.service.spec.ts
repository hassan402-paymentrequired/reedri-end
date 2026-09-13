import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, TripStatus } from '@prisma/client';
import { RatingsService } from './ratings.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

describe('RatingsService', () => {
  const trip = {
    id: 'trip-1',
    riderId: 'rider-1',
    driverId: 'driver-1',
    status: TripStatus.COMPLETED,
  };

  function buildService(
    overrides: Partial<{ findUnique: jest.Mock; create: jest.Mock }> = {},
  ) {
    const prisma = {
      trip: {
        findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(trip),
      },
      rating: {
        create:
          overrides.create ?? jest.fn().mockResolvedValue({ id: 'rating-1' }),
      },
    } as unknown as PrismaService;
    const usersService = {
      recalculateRating: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<UsersService>;
    return {
      service: new RatingsService(prisma, usersService),
      prisma,
      usersService,
    };
  }

  it('rates the driver when the rider submits the rating', async () => {
    const { service, usersService } = buildService();
    await service.rateTrip('trip-1', 'rider-1', { score: 5 });
    expect(usersService.recalculateRating).toHaveBeenCalledWith('driver-1');
  });

  it('rates the rider when the driver submits the rating', async () => {
    const { service, usersService } = buildService();
    await service.rateTrip('trip-1', 'driver-1', { score: 4 });
    expect(usersService.recalculateRating).toHaveBeenCalledWith('rider-1');
  });

  it('rejects a rater who was not a participant on the trip', async () => {
    const { service } = buildService();
    await expect(
      service.rateTrip('trip-1', 'stranger', { score: 5 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects rating a trip that is not completed', async () => {
    const { service } = buildService({
      findUnique: jest
        .fn()
        .mockResolvedValue({ ...trip, status: TripStatus.STARTED }),
    });
    await expect(
      service.rateTrip('trip-1', 'rider-1', { score: 5 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException for a missing trip', async () => {
    const { service } = buildService({
      findUnique: jest.fn().mockResolvedValue(null),
    });
    await expect(
      service.rateTrip('missing', 'rider-1', { score: 5 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a duplicate rating with ConflictException', async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError(
      'duplicate',
      {
        code: 'P2002',
        clientVersion: 'test',
      },
    );
    const { service } = buildService({
      create: jest.fn().mockRejectedValue(duplicateError),
    });
    await expect(
      service.rateTrip('trip-1', 'rider-1', { score: 5 }),
    ).rejects.toThrow('You have already rated this trip');
  });
});
