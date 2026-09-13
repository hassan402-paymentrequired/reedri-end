import type Redis from 'ioredis';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  function buildService() {
    const redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    } as unknown as jest.Mocked<Redis>;
    return { service: new CacheService(redis), redis };
  }

  describe('get', () => {
    it('returns null on a cache miss', async () => {
      const { service, redis } = buildService();
      (redis.get as jest.Mock).mockResolvedValue(null);
      expect(await service.get('key')).toBeNull();
    });

    it('parses and returns a cached JSON value', async () => {
      const { service, redis } = buildService();
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ a: 1 }));
      expect(await service.get('key')).toEqual({ a: 1 });
    });

    it('treats unparseable cached data as a miss rather than throwing', async () => {
      const { service, redis } = buildService();
      (redis.get as jest.Mock).mockResolvedValue('not-json{{{');
      expect(await service.get('key')).toBeNull();
    });
  });

  describe('set', () => {
    it('serializes the value and sets a TTL', async () => {
      const { service, redis } = buildService();
      await service.set('key', { a: 1 }, 60);
      expect(redis.set).toHaveBeenCalledWith(
        'key',
        JSON.stringify({ a: 1 }),
        'EX',
        60,
      );
    });
  });

  describe('getOrSet', () => {
    it('returns the cached value without calling the factory on a hit', async () => {
      const { service, redis } = buildService();
      (redis.get as jest.Mock).mockResolvedValue(JSON.stringify('cached'));
      const factory = jest.fn().mockResolvedValue('fresh');

      const result = await service.getOrSet('key', 60, factory);

      expect(result).toBe('cached');
      expect(factory).not.toHaveBeenCalled();
    });

    it('calls the factory and caches the result on a miss', async () => {
      const { service, redis } = buildService();
      (redis.get as jest.Mock).mockResolvedValue(null);
      const factory = jest.fn().mockResolvedValue('fresh');

      const result = await service.getOrSet('key', 60, factory);

      expect(result).toBe('fresh');
      expect(redis.set).toHaveBeenCalledWith(
        'key',
        JSON.stringify('fresh'),
        'EX',
        60,
      );
    });

    it('propagates a factory rejection without caching anything', async () => {
      const { service, redis } = buildService();
      (redis.get as jest.Mock).mockResolvedValue(null);
      const factory = jest.fn().mockRejectedValue(new Error('boom'));

      await expect(service.getOrSet('key', 60, factory)).rejects.toThrow(
        'boom',
      );
      expect(redis.set).not.toHaveBeenCalled();
    });
  });
});
