import { Exclude, Expose, plainToInstance } from 'class-transformer';
import { DriverDocumentType } from '@prisma/client';

@Exclude()
export class DriverDocumentResponseDto {
  @Expose() id!: string;
  @Expose() type!: DriverDocumentType;
  @Expose() originalFilename!: string;
  @Expose() mimeType!: string;
  @Expose() sizeBytes!: number;
  @Expose() uploadedAt!: Date;

  static from(entity: {
    id: string;
    type: DriverDocumentType;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: Date;
  }): DriverDocumentResponseDto {
    return plainToInstance(DriverDocumentResponseDto, entity, {
      excludeExtraneousValues: true,
    });
  }
}
