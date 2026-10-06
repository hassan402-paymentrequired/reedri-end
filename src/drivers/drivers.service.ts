import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { OffersService } from '../offers/offers.service';
import { CacheService } from '../common/cache/cache.service';
import {
  DomainEvent,
  DriverLocationUpdatedEvent,
  DriverOnlineStatusChangedEvent,
} from '../common/events/domain-events';
import { DriverStatusResponseDto } from './dto/driver-status-response.dto';
import { DriverLocationResponseDto } from './dto/driver-location-response.dto';

interface DriverIdentity {
  id: string;
  userId: string;
}

// A DriverProfile's id/userId pair is fixed the moment an application is
// verified and never changes afterwards, so a fairly long TTL is safe — this
// cache holds nothing that can go stale. If a profile ever becomes deletable,
// that path MUST call cache.del(driverIdentityCacheKey(userId)); there is no
// other invalidation.
const DRIVER_IDENTITY_CACHE_TTL_SECONDS = 300;

function driverIdentityCacheKey(userId: string): string {
  return `driver-identity:${userId}`;
}

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offersService: OffersService,
    private readonly cache: CacheService,
    private readonly events: EventEmitter2,
  ) {}

  /** Full, always-fresh row — use when you need current isOnline/location. */
  findByUserId(userId: string) {
    return this.prisma.driverProfile.findUnique({ where: { userId } });
  }

  /**
   * Cached existence+id lookup. Only ever returns {id, userId} — deliberately
   * narrow so it's impossible to accidentally read a stale isOnline/location
   * value through this path. Use findByUserId() instead when freshness of
   * those fields matters.
   */
  async findIdentityByUserId(userId: string): Promise<DriverIdentity | null> {
    return this.cache.getOrSet(
      driverIdentityCacheKey(userId),
      DRIVER_IDENTITY_CACHE_TTL_SECONDS,
      () =>
        this.prisma.driverProfile.findUnique({
          where: { userId },
          select: { id: true, userId: true },
        }),
    );
  }

  async setOnlineStatus(userId: string, isOnline: boolean) {
    const profile = await this.findIdentityByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Driver profile not found');
    }

    // No document-completeness check here: a DriverProfile only exists once a
    // complete application was verified, so there is nothing left to gate on.
    const updated = await this.prisma.driverProfile.update({
      where: { userId },
      data: { isOnline },
    });
    this.events.emit(
      DomainEvent.DriverOnlineStatusChanged,
      new DriverOnlineStatusChangedEvent(
        userId,
        isOnline,
        updated.currentLat,
        updated.currentLng,
      ),
    );
    return DriverStatusResponseDto.from(updated);
  }

  async updateLocation(userId: string, lat: number, lng: number) {
    const profile = await this.findIdentityByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Driver profile not found');
    }
    const updated = await this.prisma.driverProfile.update({
      where: { userId },
      data: { currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() },
    });
    // Powers the rider-facing live map (see RealtimeGateway's
    // rider:track:subscribe) — fires whether the update came in over the WS
    // event or this REST fallback, so both paths keep the map current.
    this.events.emit(
      DomainEvent.DriverLocationUpdated,
      new DriverLocationUpdatedEvent(userId, lat, lng),
    );
    return DriverLocationResponseDto.from(updated);
  }

  /**
   * Called on socket disconnect. Immediately stops the driver from receiving
   * new ride broadcasts, but gives their pending offers a grace period
   * (OFFER_EXPIRY_SECONDS) in case it's just a brief reconnect.
   */
  async goOffline(userId: string): Promise<void> {
    const profile = await this.findIdentityByUserId(userId);
    if (!profile) return;
    const updated = await this.prisma.driverProfile.update({
      where: { userId },
      data: { isOnline: false },
    });
    this.events.emit(
      DomainEvent.DriverOnlineStatusChanged,
      new DriverOnlineStatusChangedEvent(
        userId,
        false,
        updated.currentLat,
        updated.currentLng,
      ),
    );
    await this.offersService.scheduleDriverOfferExpiry(profile.id);
  }
}
