import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DriversService } from './drivers.service';
import { PrismaService } from '../prisma/prisma.service';
import { OffersService } from '../offers/offers.service';
import { CacheService } from '../common/cache/cache.service';
import {
  DomainEvent,
  DriverLocationUpdatedEvent,
  DriverOnlineStatusChangedEvent,
} from '../common/events/domain-events';

describe('DriversService', () => {
  const profile = {
    id: 'driver-profile-1',
    userId: 'driver-user-1',
    currentLat: 6.5,
    currentLng: 3.4,
  };

  function buildService() {
    const prisma = {
      driverProfile: {
        findUnique: jest.fn().mockResolvedValue(profile),
        update: jest.fn().mockResolvedValue(profile),
      },
    } as unknown as PrismaService;

    const offersService = {
      scheduleDriverOfferExpiry: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OffersService>;

    // Bypass caching in unit tests — always call through to the factory so
    // these tests exercise the same Prisma mocks as before the cache existed.
    const cache = {
      getOrSet: jest.fn((_key: string, _ttl: number, factory: () => unknown) =>
        factory(),
      ),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<CacheService>;

    const events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;

    return {
      service: new DriversService(prisma, offersService, cache, events),
      prisma,
      offersService,
      cache,
      events,
    };
  }

  describe('setOnlineStatus', () => {
    it('throws NotFoundException when the driver has no profile', async () => {
      const { service, prisma } = buildService();
      (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.setOnlineStatus('driver-user-1', true),
      ).rejects.toThrow(NotFoundException);
    });

    // Verification is settled by the time a DriverProfile exists, so going
    // online has nothing left to check beyond the profile itself.
    it('goes online without any document check', async () => {
      const { service, prisma } = buildService();
      await service.setOnlineStatus('driver-user-1', true);
      expect(prisma.driverProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isOnline: true } }),
      );
    });

    it('emits DriverOnlineStatusChanged with the profile location', async () => {
      const { service, events } = buildService();
      await service.setOnlineStatus('driver-user-1', true);
      expect(events.emit).toHaveBeenCalledWith(
        DomainEvent.DriverOnlineStatusChanged,
        new DriverOnlineStatusChangedEvent('driver-user-1', true, 6.5, 3.4),
      );
    });
  });

  describe('updateLocation', () => {
    it('emits DriverLocationUpdated so the live map can pick it up', async () => {
      const { service, events } = buildService();
      await service.updateLocation('driver-user-1', 6.6, 3.5);
      expect(events.emit).toHaveBeenCalledWith(
        DomainEvent.DriverLocationUpdated,
        new DriverLocationUpdatedEvent('driver-user-1', 6.6, 3.5),
      );
    });
  });

  describe('goOffline', () => {
    it('emits DriverOnlineStatusChanged(false) with the last known location', async () => {
      const { service, events } = buildService();
      await service.goOffline('driver-user-1');
      expect(events.emit).toHaveBeenCalledWith(
        DomainEvent.DriverOnlineStatusChanged,
        new DriverOnlineStatusChangedEvent('driver-user-1', false, 6.5, 3.4),
      );
    });

    it('no-ops for a user who has no driver profile', async () => {
      const { service, prisma, events } = buildService();
      (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.goOffline('rider-user-1')).resolves.toBeUndefined();
      expect(prisma.driverProfile.update).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('findIdentityByUserId caching', () => {
    it('goes through CacheService.getOrSet with the expected key and TTL', async () => {
      const { service, cache } = buildService();
      await service.findIdentityByUserId('driver-user-1');
      expect(cache.getOrSet).toHaveBeenCalledWith(
        'driver-identity:driver-user-1',
        300,
        expect.any(Function),
      );
    });

    it('queries Prisma with a narrow select — id and userId only', async () => {
      const { service, prisma } = buildService();
      await service.findIdentityByUserId('driver-user-1');
      expect(prisma.driverProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'driver-user-1' },
        select: { id: true, userId: true },
      });
    });

    it('is used by setOnlineStatus, updateLocation, and goOffline instead of a fresh query', async () => {
      const { service, cache } = buildService();
      await service.setOnlineStatus('driver-user-1', true);
      await service.updateLocation('driver-user-1', 6.5, 3.4);
      await service.goOffline('driver-user-1');
      expect(cache.getOrSet).toHaveBeenCalledTimes(3);
    });
  });
});
