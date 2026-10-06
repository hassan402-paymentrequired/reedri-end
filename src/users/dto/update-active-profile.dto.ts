import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ActiveProfile } from '@prisma/client';

export class UpdateActiveProfileDto {
  @ApiProperty({ enum: ActiveProfile })
  @IsEnum(ActiveProfile)
  profile: ActiveProfile;
}
