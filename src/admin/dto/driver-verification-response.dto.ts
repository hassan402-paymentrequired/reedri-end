import { Exclude, Expose, plainToInstance } from 'class-transformer';

@Exclude()
export class DriverVerificationResponseDto {
  @Expose() id!: string;
  @Expose() isVerified!: boolean;

  static from(entity: {
    id: string;
    isVerified: boolean;
  }): DriverVerificationResponseDto {
    return plainToInstance(DriverVerificationResponseDto, entity, {
      excludeExtraneousValues: true,
    });
  }
}
