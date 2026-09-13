import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { SkipResponseEnvelope } from '../common/decorators/skip-response-envelope.decorator';

// Infra probes (load balancers, orchestrators) expect Terminus's bare
// {status, info, error, details} shape, not the API's success envelope.
@SkipResponseEnvelope()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // Load balancers / orchestrators poll this frequently and must never get
  // rate-limited — that would look like the app is down when it isn't.
  @SkipThrottle()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      (): Promise<HealthIndicatorResult> => this.checkDatabase(),
      (): Promise<HealthIndicatorResult> => this.checkRedis(),
    ]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: { status: 'up' } };
    } catch {
      return { database: { status: 'down' } };
    }
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    try {
      await this.redis.ping();
      return { redis: { status: 'up' } };
    } catch {
      return { redis: { status: 'down' } };
    }
  }
}
