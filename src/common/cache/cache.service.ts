import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.module';

/**
 * Thin cache-aside wrapper over the shared Redis connection. Deliberately
 * not a generic "cache everything" layer — call sites decide what's safe to
 * cache and for how long; this just removes the get/set/JSON boilerplate.
 *
 * Never cache anything whose staleness could produce a wrong decision (e.g.
 * live driver locations for matching) — see MatchingService, which
 * intentionally does not use this.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.logger.warn(
        `Failed to parse cached value for key ${key}, treating as a miss`,
      );
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * Cache-aside: return the cached value if present, otherwise compute it
   * via `factory`, cache the result, and return it. A `factory` rejection
   * is not cached and propagates normally.
   */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
