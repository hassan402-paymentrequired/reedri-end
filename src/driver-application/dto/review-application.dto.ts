import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { DriverApplicationStatus } from '@prisma/client';

export const REVIEW_DECISIONS = [
  DriverApplicationStatus.VERIFIED,
  DriverApplicationStatus.REJECTED,
] as const;

export class ReviewApplicationDto {
  @ApiProperty({ enum: REVIEW_DECISIONS })
  @IsIn(REVIEW_DECISIONS)
  decision: (typeof REVIEW_DECISIONS)[number];

  @ApiPropertyOptional({ example: 'License photo is too blurry to read' })
  @ValidateIf(
    (dto: ReviewApplicationDto) =>
      dto.decision === DriverApplicationStatus.REJECTED,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  rejectionReason?: string;
}
