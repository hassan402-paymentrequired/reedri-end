import { ForbiddenException, Injectable } from '@nestjs/common';
import { ActiveProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DriversService } from '../drivers/drivers.service';
import { ActiveProfileResponseDto } from './dto/active-profile-response.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly driversService: DriversService,
  ) {}

  findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Switches which mode of the app the user is in. Driver mode requires a
   * DriverProfile, which only exists once their application was verified.
   */
  async setActiveProfile(userId: string, profile: ActiveProfile) {
    if (profile === ActiveProfile.DRIVER) {
      const driverProfile = await this.prisma.driverProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!driverProfile) {
        throw new ForbiddenException(
          'Complete driver verification before switching to driver mode',
        );
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { activeProfile: profile },
    });

    // Leaving driver mode must drop them out of the matching pool — otherwise
    // they keep receiving ride broadcasts they can no longer act on. No-ops
    // for a user who never had a driver profile.
    if (profile === ActiveProfile.RIDER) {
      await this.driversService.goOffline(userId);
    }

    return ActiveProfileResponseDto.from(user);
  }

  /**
   * Recomputes a user's rating as the average of all ratings they've received.
   * Called after each new rating is submitted (see RatingsService).
   */
  async recalculateRating(userId: string): Promise<void> {
    const { _avg } = await this.prisma.rating.aggregate({
      where: { toUserId: userId },
      _avg: { score: true },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { rating: _avg.score ?? 5.0 },
    });
  }
}
