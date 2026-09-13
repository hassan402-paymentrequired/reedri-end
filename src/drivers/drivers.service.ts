import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OffersService } from '../offers/offers.service';
import { CacheService } from '../common/cache/cache.service';
import {
  DriverDocumentsService,
  REQUIRED_DOCUMENT_TYPES,
} from './driver-documents.service';
import { DriverStatusResponseDto } from './dto/driver-status-response.dto';
import { DriverLocationResponseDto } from './dto/driver-location-response.dto';
import { DriverAdminSummaryResponseDto } from '../admin/dto/driver-admin-summary-response.dto';
import { DriverVerificationResponseDto } from '../admin/dto/driver-verification-response.dto';

interface DriverIdentity {
  id: string;
  userId: string;
}

// Identity fields are set once at registration and never updated by any
// current endpoint, so a fairly long TTL is safe. If a "change vehicle info"
// endpoint is ever added, it MUST call cache.del(driverIdentityCacheKey(userId))
// — this cache has no other invalidation path.
const DRIVER_IDENTITY_CACHE_TTL_SECONDS = 300;

function driverIdentityCacheKey(userId: string): string {
  return `driver-identity:${userId}`;
}

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offersService: OffersService,
    private readonly driverDocumentsService: DriverDocumentsService,
    private readonly cache: CacheService,
  ) {}

  createProfile(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      vehicleMake: string;
      vehicleModel: string;
      plateNumber: string;
    },
  ) {
    return tx.driverProfile.create({ data: params });
  }

  /** Full, always-fresh row — use when you need current isOnline/location/isVerified. */
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

    if (isOnline) {
      const missing = await this.driverDocumentsService.missingRequiredTypes(
        profile.id,
      );
      if (missing.length > 0) {
        throw new BadRequestException(
          `Complete your driver profile before going online — missing: ${missing.join(', ')}`,
        );
      }
    }

    const updated = await this.prisma.driverProfile.update({
      where: { userId },
      data: { isOnline },
    });
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
    await this.prisma.driverProfile.update({
      where: { userId },
      data: { isOnline: false },
    });
    await this.offersService.scheduleDriverOfferExpiry(profile.id);
  }

  async assertPlateNumberAvailable(plateNumber: string): Promise<void> {
    const existing = await this.prisma.driverProfile.findUnique({
      where: { plateNumber },
    });
    if (existing) {
      throw new ConflictException('Plate number already registered');
    }
  }

  /** Admin-only: every driver profile with enough context to review it. */
  async listAll() {
    const profiles = await this.prisma.driverProfile.findMany({
      include: {
        user: {
          select: { id: true, name: true, phone: true, createdAt: true },
        },
        documents: { select: { type: true } },
      },
      orderBy: { user: { createdAt: 'desc' } },
    });

    return profiles.map((p) => {
      const uploadedTypes = new Set(p.documents.map((d) => d.type));
      return DriverAdminSummaryResponseDto.from({
        driverProfileId: p.id,
        userId: p.user.id,
        name: p.user.name,
        phone: p.user.phone,
        registeredAt: p.user.createdAt,
        vehicleMake: p.vehicleMake,
        vehicleModel: p.vehicleModel,
        plateNumber: p.plateNumber,
        isOnline: p.isOnline,
        isVerified: p.isVerified,
        missingDocumentTypes: REQUIRED_DOCUMENT_TYPES.filter(
          (t) => !uploadedTypes.has(t),
        ),
      });
    });
  }

  async setVerified(driverProfileId: string, isVerified: boolean) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id: driverProfileId },
    });
    if (!profile) {
      throw new NotFoundException('Driver profile not found');
    }
    const updated = await this.prisma.driverProfile.update({
      where: { id: driverProfileId },
      data: { isVerified },
    });
    return DriverVerificationResponseDto.from(updated);
  }
}
