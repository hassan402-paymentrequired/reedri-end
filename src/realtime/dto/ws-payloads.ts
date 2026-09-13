import { IsLatitude, IsLongitude, IsPositive, IsUUID } from 'class-validator';

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
