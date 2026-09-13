import { ApiProperty } from '@nestjs/swagger';
import { IsPositive } from 'class-validator';

export class SubmitOfferDto {
  @ApiProperty({ example: 1800 })
  @IsPositive()
  offeredFare: number;
}
