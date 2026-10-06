import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { DriverDocumentType } from '@prisma/client';
import { OPTIONAL_DOCUMENT_TYPES } from '../driver-application.service';

export class UploadOptionalDocumentDto {
  @ApiProperty({ enum: OPTIONAL_DOCUMENT_TYPES })
  @IsIn(OPTIONAL_DOCUMENT_TYPES)
  type: DriverDocumentType;
}
