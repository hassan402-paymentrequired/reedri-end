import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { DriverDocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { DriverDocumentResponseDto } from './dto/driver-document-response.dto';

export const REQUIRED_DOCUMENT_TYPES: DriverDocumentType[] = [
  DriverDocumentType.DRIVERS_LICENSE,
  DriverDocumentType.VEHICLE_REGISTRATION,
  DriverDocumentType.PROOF_OF_INSURANCE,
  DriverDocumentType.PROFILE_PHOTO,
];

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

export interface UploadableFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class DriverDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  static isAllowedMimeType(mimetype: string): boolean {
    return ALLOWED_MIME_TYPES.has(mimetype);
  }

  async upload(
    driverUserId: string,
    type: DriverDocumentType,
    file: UploadableFile,
  ) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported file type — use JPEG, PNG, or PDF',
      );
    }

    const driverProfile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverUserId },
    });
    if (!driverProfile) {
      throw new NotFoundException('Driver profile not found');
    }

    const existing = await this.prisma.driverDocument.findUnique({
      where: {
        driverProfileId_type: { driverProfileId: driverProfile.id, type },
      },
    });

    const storageKey = `driver-documents/${driverProfile.id}/${type}-${randomUUID()}${extname(file.originalname)}`;
    await this.storage.save(storageKey, file.buffer);

    const document = await this.prisma.driverDocument.upsert({
      where: {
        driverProfileId_type: { driverProfileId: driverProfile.id, type },
      },
      create: {
        driverProfileId: driverProfile.id,
        type,
        storageKey,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
      update: {
        storageKey,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedAt: new Date(),
      },
    });

    // Best-effort cleanup of the replaced file; the DB row is the source of
    // truth either way, so a leftover orphan file here isn't a correctness bug.
    if (existing && existing.storageKey !== storageKey) {
      await this.storage.delete(existing.storageKey).catch(() => undefined);
    }

    return DriverDocumentResponseDto.from(document);
  }

  async listOwn(driverUserId: string) {
    const driverProfile = await this.prisma.driverProfile.findUnique({
      where: { userId: driverUserId },
    });
    if (!driverProfile) {
      throw new NotFoundException('Driver profile not found');
    }
    const documents = await this.prisma.driverDocument.findMany({
      where: { driverProfileId: driverProfile.id },
    });
    return documents.map((d) => DriverDocumentResponseDto.from(d));
  }

  async missingRequiredTypes(
    driverProfileId: string,
  ): Promise<DriverDocumentType[]> {
    const documents = await this.prisma.driverDocument.findMany({
      where: { driverProfileId },
      select: { type: true },
    });
    const uploadedTypes = new Set(documents.map((d) => d.type));
    return REQUIRED_DOCUMENT_TYPES.filter((t) => !uploadedTypes.has(t));
  }

  /**
   * Admin-only: a driver's documents for review. Public shape even here —
   * the storage key is an internal detail, irrelevant to the caller and
   * not worth exposing; use getFileBuffer(documentId) to fetch content.
   */
  async listForDriverProfile(driverProfileId: string) {
    const documents = await this.prisma.driverDocument.findMany({
      where: { driverProfileId },
    });
    return documents.map((d) => DriverDocumentResponseDto.from(d));
  }

  async getFileBuffer(
    documentId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const document = await this.prisma.driverDocument.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    const buffer = await this.storage.read(document.storageKey);
    return {
      buffer,
      mimeType: document.mimeType,
      filename: document.originalFilename,
    };
  }
}
