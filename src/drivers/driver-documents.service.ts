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

  /**
   * Documents hang off the DriverApplication, not the DriverProfile — they're
   * uploaded during the application, before any profile exists. A verified
   * driver's documents are reached through `driverProfile.application`.
   */
  async upload(
    driverApplicationId: string,
    type: DriverDocumentType,
    file: UploadableFile,
  ) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported file type — use JPEG, PNG, or PDF',
      );
    }

    const existing = await this.prisma.driverDocument.findUnique({
      where: { driverApplicationId_type: { driverApplicationId, type } },
    });

    const storageKey = `driver-documents/${driverApplicationId}/${type}-${randomUUID()}${extname(file.originalname)}`;
    await this.storage.save(storageKey, file.buffer);

    const document = await this.prisma.driverDocument.upsert({
      where: { driverApplicationId_type: { driverApplicationId, type } },
      create: {
        driverApplicationId,
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

  /**
   * An application's documents. Public shape even for admin review — the
   * storage key is an internal detail, irrelevant to the caller and not
   * worth exposing; use getFileBuffer(documentId) to fetch content.
   */
  async listForApplication(driverApplicationId: string) {
    const documents = await this.prisma.driverDocument.findMany({
      where: { driverApplicationId },
    });
    return documents.map((d) => DriverDocumentResponseDto.from(d));
  }

  async uploadedTypes(
    driverApplicationId: string,
  ): Promise<Set<DriverDocumentType>> {
    const documents = await this.prisma.driverDocument.findMany({
      where: { driverApplicationId },
      select: { type: true },
    });
    return new Set(documents.map((d) => d.type));
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
