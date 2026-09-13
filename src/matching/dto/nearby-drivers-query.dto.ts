import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class NearbyDriversQueryDto {
  @ApiProperty({ example: 6.5244 })
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @ApiProperty({ example: 3.3792 })
  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @ApiPropertyOptional({
    example: 5,
    description: 'Defaults to RIDE_MATCH_RADIUS_KM',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(50)
  radiusKm?: number;
}
