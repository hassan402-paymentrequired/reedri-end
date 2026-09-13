import { Exclude, Expose, plainToInstance } from 'class-transformer';
import { TripStatus } from '@prisma/client';

@Exclude()
export class TripResponseDto {
  @Expose() id!: string;
  @Expose() rideRequestId!: string;
  @Expose() driverId!: string;
  @Expose() riderId!: string;
  @Expose() agreedFare!: unknown;
  @Expose() status!: TripStatus;
  @Expose() routePolyline!: string | null;
  @Expose() startedAt!: Date | null;
  @Expose() endedAt!: Date | null;
  @Expose() cancelReason!: string | null;
  @Expose() createdAt!: Date;

  static from(entity: {
    id: string;
    rideRequestId: string;
    driverId: string;
    riderId: string;
    agreedFare: unknown;
    status: TripStatus;
    routePolyline: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    cancelReason: string | null;
    createdAt: Date;
  }): TripResponseDto {
    return plainToInstance(TripResponseDto, entity, {
      excludeExtraneousValues: true,
    });
  }
}
