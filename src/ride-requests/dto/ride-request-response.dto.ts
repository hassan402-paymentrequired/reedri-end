import { Exclude, Expose, Type, plainToInstance } from 'class-transformer';
import { OfferStatus, RideRequestStatus } from '@prisma/client';

@Exclude()
export class RideOfferDriverResponseDto {
  @Expose() id!: string;
  @Expose() name!: string;
  @Expose() rating!: number;
}

@Exclude()
export class RideOfferResponseDto {
  @Expose() id!: string;
  @Expose() offeredFare!: unknown;
  @Expose() status!: OfferStatus;
  @Expose() createdAt!: Date;
  @Expose()
  @Type(() => RideOfferDriverResponseDto)
  driver!: RideOfferDriverResponseDto;

  static from(entity: {
    id: string;
    offeredFare: unknown;
    status: OfferStatus;
    createdAt: Date;
    driver: { user: { id: string; name: string; rating: number } };
  }): RideOfferResponseDto {
    return plainToInstance(
      RideOfferResponseDto,
      {
        id: entity.id,
        offeredFare: entity.offeredFare,
        status: entity.status,
        createdAt: entity.createdAt,
        driver: entity.driver.user,
      },
      { excludeExtraneousValues: true },
    );
  }
}

@Exclude()
export class RideRequestResponseDto {
  @Expose() id!: string;
  @Expose() riderId!: string;
  @Expose() pickupLat!: number;
  @Expose() pickupLng!: number;
  @Expose() dropoffLat!: number;
  @Expose() dropoffLng!: number;
  @Expose() suggestedFare!: unknown;
  @Expose() status!: RideRequestStatus;
  @Expose() cancelReason!: string | null;
  @Expose() cancelledAt!: Date | null;
  @Expose() createdAt!: Date;
  @Expose() nearbyDriverCount?: number;
  // Not yet typed as a nested DTO — Trip has no sensitive fields, and
  // this module doesn't own the trips response shape (see trips module).
  @Expose() trip?: unknown;
  @Expose()
  @Type(() => RideOfferResponseDto)
  offers?: RideOfferResponseDto[];

  static from(entity: {
    id: string;
    riderId: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    suggestedFare: unknown;
    status: RideRequestStatus;
    cancelReason: string | null;
    cancelledAt: Date | null;
    createdAt: Date;
    nearbyDriverCount?: number;
    trip?: unknown;
    offers?: {
      id: string;
      offeredFare: unknown;
      status: OfferStatus;
      createdAt: Date;
      driver: { user: { id: string; name: string; rating: number } };
    }[];
  }): RideRequestResponseDto {
    return plainToInstance(
      RideRequestResponseDto,
      {
        ...entity,
        offers: entity.offers?.map((o) => RideOfferResponseDto.from(o)),
      },
      { excludeExtraneousValues: true },
    );
  }
}
