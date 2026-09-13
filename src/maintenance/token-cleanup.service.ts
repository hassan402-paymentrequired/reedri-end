import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Refresh tokens are rotated on every use and revoked on logout, so the
   * table accumulates dead rows forever without this. Anything past its
   * expiresAt can never be used again regardless of revocation state, so
   * it's safe to delete outright.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async removeExpiredRefreshTokens(): Promise<void> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) {
      this.logger.log(`Removed ${count} expired refresh token(s)`);
    }
  }
}
