import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface NearbyDriver {
  driverId: string;
  userId: string;
  distanceMeters: number;
}

export interface NearbyDriverLocation {
  driverId: string;
  userId: string;
  lat: number;
  lng: number;
  vehicleMake: string;
  vehicleModel: string;
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

  /**
   * Same radius query as findNearbyDrivers, but for the rider-facing live
   * map (GET /matching/nearby-drivers): includes coordinates and vehicle
   * info for rendering pins, kept separate so callers doing ride matching
   * aren't affected by this endpoint's shape.
   */
  async findNearbyDriverLocations(
    lat: number,
    lng: number,
    radiusKm?: number,
  ): Promise<NearbyDriverLocation[]> {
    const radiusMeters =
      (radiusKm ?? this.config.get<number>('RIDE_MATCH_RADIUS_KM', 5)) * 1000;

    return this.prisma.$queryRaw<NearbyDriverLocation[]>`
      SELECT
        dp.id AS "driverId",
        dp.user_id AS "userId",
        dp.current_lat AS "lat",
        dp.current_lng AS "lng",
        dp.vehicle_make AS "vehicleMake",
        dp.vehicle_model AS "vehicleModel",
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
