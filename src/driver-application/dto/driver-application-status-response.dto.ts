import { Exclude, Expose, plainToInstance } from 'class-transformer';
import { DriverApplicationStatus } from '@prisma/client';

@Exclude()
export class DriverApplicationStatusResponseDto {
  @Expose() status!: DriverApplicationStatus;
  /** Which of the three steps the app should open on, or null once submitted. */
  @Expose() currentStep!: number | null;
  @Expose() rejectionReason!: string | null;

  static from(entity: {
    status: DriverApplicationStatus;
    currentStep: number | null;
    rejectionReason: string | null;
  }): DriverApplicationStatusResponseDto {
    return plainToInstance(DriverApplicationStatusResponseDto, entity, {
      excludeExtraneousValues: true,
    });
  }
}
