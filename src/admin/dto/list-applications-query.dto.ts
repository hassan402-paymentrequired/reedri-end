import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { DriverApplicationStatus } from '@prisma/client';

export class ListApplicationsQueryDto {
  @ApiPropertyOptional({
    enum: DriverApplicationStatus,
    default: DriverApplicationStatus.UNDER_REVIEW,
  })
  @IsOptional()
  @IsEnum(DriverApplicationStatus)
  status: DriverApplicationStatus = DriverApplicationStatus.UNDER_REVIEW;
}
