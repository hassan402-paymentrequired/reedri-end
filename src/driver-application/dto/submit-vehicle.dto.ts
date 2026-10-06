import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  MinDate,
} from 'class-validator';

const EARLIEST_VEHICLE_YEAR = 1980;

export class SubmitVehicleDto {
  @ApiProperty({ example: 'Toyota' })
  @IsString()
  @IsNotEmpty()
  vehicleMake: string;

  @ApiProperty({ example: 'Corolla' })
  @IsString()
  @IsNotEmpty()
  vehicleModel: string;

  @ApiProperty({ example: 2018 })
  @Type(() => Number)
  @IsInt()
  @Min(EARLIEST_VEHICLE_YEAR)
  // Manufacturers sell next year's model this year, so allow one year ahead.
  @Max(new Date().getFullYear() + 1)
  vehicleYear: number;

  @ApiProperty({ example: 'Silver' })
  @IsString()
  @IsNotEmpty()
  vehicleColor: string;

  @ApiProperty({ example: 'LAG-123-XY' })
  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  @ApiProperty({ example: '2027-05-30', type: String, format: 'date' })
  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), {
    message: 'Vehicle registration has already expired',
  })
  registrationExpiryDate: Date;
}
