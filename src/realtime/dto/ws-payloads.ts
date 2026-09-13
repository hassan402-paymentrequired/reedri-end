import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class SubmitOfferPayload {
  @IsUUID()
  rideRequestId: string;

  @IsPositive()
  offeredFare: number;
}

export class AcceptOfferPayload {
  @IsUUID()
  offerId: string;
}

export class LocationUpdatePayload {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}

// Center point + radius a rider wants nearby driver pins for, e.g. their
// current map viewport. Omitting radiusKm falls back to RIDE_MATCH_RADIUS_KM.
export class TrackNearbyPayload {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(50)
  radiusKm?: number;
}
