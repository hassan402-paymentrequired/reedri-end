import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface NearbyDriver {
  driverId: string;
  userId: string;
  distanceMeters: number;
}

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Online drivers within `radiusKm` of (lat, lng), nearest first.
   * Uses the geography column + GiST index synced by a DB trigger from
   * current_lat/current_lng — see prisma/migrations/*_postgis_geo_sync.
   */
  async findNearbyDrivers(
    lat: number,
    lng: number,
    radiusKm?: number,
  ): Promise<NearbyDriver[]> {
    const radiusMeters =
      (radiusKm ?? this.config.get<number>('RIDE_MATCH_RADIUS_KM', 5)) * 1000;

    return this.prisma.$queryRaw<NearbyDriver[]>`
      SELECT
        dp.id AS "driverId",
        dp.user_id AS "userId",
        ST_Distance(dp.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS "distanceMeters"
      FROM driver_profiles dp
      WHERE dp.is_online = true
        AND dp.location IS NOT NULL
        AND ST_DWithin(dp.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})
      ORDER BY dp.location <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      LIMIT 50;
    `;
  }
}
