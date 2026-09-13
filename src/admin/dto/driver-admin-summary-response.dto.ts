import { Exclude, Expose, plainToInstance } from 'class-transformer';
import { DriverDocumentType } from '@prisma/client';

@Exclude()
export class DriverAdminSummaryResponseDto {
  @Expose() driverProfileId!: string;
  @Expose() userId!: string;
  @Expose() name!: string;
  @Expose() phone!: string;
  @Expose() registeredAt!: Date;
  @Expose() vehicleMake!: string;
  @Expose() vehicleModel!: string;
  @Expose() plateNumber!: string;
  @Expose() isOnline!: boolean;
  @Expose() isVerified!: boolean;
  @Expose() missingDocumentTypes!: DriverDocumentType[];

  static from(entity: {
    driverProfileId: string;
    userId: string;
    name: string;
    phone: string;
    registeredAt: Date;
    vehicleMake: string;
    vehicleModel: string;
    plateNumber: string;
    isOnline: boolean;
    isVerified: boolean;
    missingDocumentTypes: DriverDocumentType[];
  }): DriverAdminSummaryResponseDto {
    return plainToInstance(DriverAdminSummaryResponseDto, entity, {
      excludeExtraneousValues: true,
    });
  }
}
