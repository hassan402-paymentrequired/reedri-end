import { Exclude, Expose, plainToInstance } from 'class-transformer';

@Exclude()
export class DriverLocationResponseDto {
  @Expose() id!: string;
  @Expose() currentLat!: number | null;
  @Expose() currentLng!: number | null;
  @Expose() locationUpdatedAt!: Date | null;

  static from(entity: {
    id: string;
    currentLat: number | null;
    currentLng: number | null;
    locationUpdatedAt: Date | null;
  }): DriverLocationResponseDto {
    return plainToInstance(DriverLocationResponseDto, entity, {
      excludeExtraneousValues: true,
    });
  }
}
