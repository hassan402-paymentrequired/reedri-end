import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OffersService } from '../offers/offers.service';

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offersService: OffersService,
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

  findByUserId(userId: string) {
    return this.prisma.driverProfile.findUnique({ where: { userId } });
  }

  async setOnlineStatus(userId: string, isOnline: boolean) {
    const profile = await this.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Driver profile not found');
    }
    return this.prisma.driverProfile.update({
      where: { userId },
      data: { isOnline },
    });
  }

  async updateLocation(userId: string, lat: number, lng: number) {
    const profile = await this.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Driver profile not found');
    }
    return this.prisma.driverProfile.update({
      where: { userId },
      data: { currentLat: lat, currentLng: lng, locationUpdatedAt: new Date() },
    });
  }

  /**
   * Called on socket disconnect. Immediately stops the driver from receiving
   * new ride broadcasts, but gives their pending offers a grace period
   * (OFFER_EXPIRY_SECONDS) in case it's just a brief reconnect.
   */
  async goOffline(userId: string): Promise<void> {
    const profile = await this.findByUserId(userId);
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
}
