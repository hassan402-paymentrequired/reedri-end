import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsPositive } from 'class-validator';

export class CreateRideRequestDto {
  @ApiProperty({ example: 6.5244 })
  @IsLatitude()
  pickupLat: number;

  @ApiProperty({ example: 3.3792 })
  @IsLongitude()
  pickupLng: number;

  @ApiProperty({ example: 6.6018 })
  @IsLatitude()
  dropoffLat: number;

  @ApiProperty({ example: 3.3515 })
  @IsLongitude()
  dropoffLng: number;

  @ApiProperty({ example: 1500, description: 'Suggested fare in NGN' })
  @IsPositive()
  suggestedFare: number;
}
