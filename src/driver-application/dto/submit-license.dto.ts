import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsString, MinDate } from 'class-validator';

export class SubmitLicenseDto {
  @ApiProperty({ example: 'LSD-A1B2C3D4' })
  @IsString()
  @IsNotEmpty()
  licenseNumber: string;

  @ApiProperty({ example: '2029-08-01', type: String, format: 'date' })
  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), { message: 'License has already expired' })
  licenseExpiryDate: Date;
}
