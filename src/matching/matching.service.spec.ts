import { ConfigService } from '@nestjs/config';
import { MatchingService } from './matching.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MatchingService', () => {
  function buildService(configDefault = 5) {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const config = {
      get: jest.fn().mockReturnValue(configDefault),
    } as unknown as ConfigService;
    return { service: new MatchingService(prisma, config), queryRaw };
  }

  it('converts the configured default radius (km) to meters', async () => {
    const { service, queryRaw } = buildService(5);
    await service.findNearbyDrivers(6.5244, 3.3792);

    const callArgs = queryRaw.mock.calls[0] as unknown[];
    // First arg is the template strings array; the rest are substitutions
    // in source order (lng, lat, lng, lat, radiusMeters, lng, lat).
    expect(callArgs).toContain(5000);
  });

  it('uses an explicit radiusKm override instead of the configured default', async () => {
    const { service, queryRaw } = buildService(5);
    await service.findNearbyDrivers(6.5244, 3.3792, 2);

    const callArgs = queryRaw.mock.calls[0] as unknown[];
    expect(callArgs).toContain(2000);
    expect(callArgs).not.toContain(5000);
  });

  it('returns whatever the query resolves', async () => {
    const nearby = [{ driverId: 'd1', userId: 'u1', distanceMeters: 100 }];
    const queryRaw = jest.fn().mockResolvedValue(nearby);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const config = {
      get: jest.fn().mockReturnValue(5),
    } as unknown as ConfigService;
    const service = new MatchingService(prisma, config);

    const result = await service.findNearbyDrivers(6.5244, 3.3792);
    expect(result).toBe(nearby);
  });
});
