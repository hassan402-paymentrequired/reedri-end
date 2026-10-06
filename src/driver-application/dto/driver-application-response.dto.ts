import { Exclude, Expose, plainToInstance } from 'class-transformer';
import { DriverApplicationStatus } from '@prisma/client';

@Exclude()
export class DriverApplicationResponseDto {
  @Expose() id!: string;
  @Expose() userId!: string;
  @Expose() status!: DriverApplicationStatus;
  @Expose() fullLegalName!: string | null;
  @Expose() dateOfBirth!: Date | null;
  @Expose() residentialAddress!: string | null;
  @Expose() licenseNumber!: string | null;
  @Expose() licenseExpiryDate!: Date | null;
  @Expose() vehicleMake!: string | null;
  @Expose() vehicleModel!: string | null;
  @Expose() vehicleYear!: number | null;
  @Expose() vehicleColor!: string | null;
  @Expose() plateNumber!: string | null;
  @Expose() registrationExpiryDate!: Date | null;
  @Expose() rejectionReason!: string | null;
  @Expose() submittedAt!: Date | null;
  @Expose() reviewedAt!: Date | null;
  @Expose() createdAt!: Date;

  static from(entity: object): DriverApplicationResponseDto {
    return plainToInstance(DriverApplicationResponseDto, entity, {
      excludeExtraneousValues: true,
    });
  }
}
