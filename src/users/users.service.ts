import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
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
