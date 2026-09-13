import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DriverDocumentType } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DriversService } from './drivers.service';
import { PrismaService } from '../prisma/prisma.service';
import { OffersService } from '../offers/offers.service';
import { DriverDocumentsService } from './driver-documents.service';
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
    plateNumber: 'LAG-1',
    currentLat: 6.5,
    currentLng: 3.4,
  };

  function buildService(missingTypes: DriverDocumentType[] = []) {
    const prisma = {
      driverProfile: {
        findUnique: jest.fn().mockResolvedValue(profile),
        update: jest.fn().mockResolvedValue(profile),
      },
    } as unknown as PrismaService;

    const offersService = {
      scheduleDriverOfferExpiry: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OffersService>;

    const driverDocumentsService = {
      missingRequiredTypes: jest.fn().mockResolvedValue(missingTypes),
    } as unknown as jest.Mocked<DriverDocumentsService>;

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
      service: new DriversService(
        prisma,
        offersService,
        driverDocumentsService,
        cache,
        events,
      ),
      prisma,
      offersService,
      driverDocumentsService,
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

    it('allows going offline regardless of document completeness', async () => {
      const { service, driverDocumentsService } = buildService([
        DriverDocumentType.DRIVERS_LICENSE,
      ]);
      await expect(
        service.setOnlineStatus('driver-user-1', false),
      ).resolves.toBeDefined();
      expect(
        driverDocumentsService.missingRequiredTypes,
      ).not.toHaveBeenCalled();
    });

    it('rejects going online when required documents are missing', async () => {
      const { service } = buildService([DriverDocumentType.DRIVERS_LICENSE]);
      await expect(
        service.setOnlineStatus('driver-user-1', true),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows going online once all required documents are present', async () => {
      const { service, prisma } = buildService([]);
      await service.setOnlineStatus('driver-user-1', true);
      expect(prisma.driverProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isOnline: true } }),
      );
    });

    it('emits DriverOnlineStatusChanged with the profile location', async () => {
      const { service, events } = buildService([]);
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
      const { service, cache } = buildService([]);
      await service.setOnlineStatus('driver-user-1', true);
      await service.updateLocation('driver-user-1', 6.5, 3.4);
      await service.goOffline('driver-user-1');
      expect(cache.getOrSet).toHaveBeenCalledTimes(3);
    });
  });

  describe('setVerified', () => {
    it('throws NotFoundException for a missing driver profile', async () => {
      const { service, prisma } = buildService();
      (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.setVerified('missing', true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates isVerified', async () => {
      const { service, prisma } = buildService();
      await service.setVerified('driver-profile-1', true);
      expect(prisma.driverProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isVerified: true } }),
      );
    });
  });

  describe('assertPlateNumberAvailable', () => {
    it('throws ConflictException when the plate number is already taken', async () => {
      const { service, prisma } = buildService();
      (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue(profile);
      await expect(service.assertPlateNumberAvailable('LAG-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('resolves when the plate number is free', async () => {
      const { service, prisma } = buildService();
      (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.assertPlateNumberAvailable('LAG-2'),
      ).resolves.toBeUndefined();
    });
  });
});
