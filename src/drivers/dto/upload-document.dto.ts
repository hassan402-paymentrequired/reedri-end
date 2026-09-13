import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { DriverDocumentType } from '@prisma/client';

export class UploadDocumentDto {
  @ApiProperty({ enum: DriverDocumentType })
  @IsEnum(DriverDocumentType)
  type: DriverDocumentType;
}
