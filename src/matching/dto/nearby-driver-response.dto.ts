import { Exclude, Expose, plainToInstance } from 'class-transformer';
import { NearbyDriverLocation } from '../matching.service';

@Exclude()
export class NearbyDriverResponseDto {
  // This is the driver's userId, not the DriverProfile id — matches the
  // `driverId` field on the WS `driver:location`/`driver:offline` events
  // (see RealtimeGateway) so the client can key map markers by one id
  // across both the REST snapshot and the live WS deltas.
  @Expose() driverId!: string;
  @Expose() lat!: number;
  @Expose() lng!: number;
  @Expose() vehicleMake!: string;
  @Expose() vehicleModel!: string;
  @Expose() distanceMeters!: number;

  static from(entity: NearbyDriverLocation): NearbyDriverResponseDto {
    return plainToInstance(
      NearbyDriverResponseDto,
      { ...entity, driverId: entity.userId },
      { excludeExtraneousValues: true },
    );
  }
}
