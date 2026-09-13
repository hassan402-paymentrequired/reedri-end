import { Exclude, Expose, plainToInstance } from 'class-transformer';

@Exclude()
export class DriverStatusResponseDto {
  @Expose() id!: string;
  @Expose() isOnline!: boolean;

  static from(entity: {
    id: string;
    isOnline: boolean;
  }): DriverStatusResponseDto {
    return plainToInstance(DriverStatusResponseDto, entity, {
      excludeExtraneousValues: true,
    });
  }
}
