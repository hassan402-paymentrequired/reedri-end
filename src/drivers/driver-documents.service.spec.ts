import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DriverDocumentType } from '@prisma/client';
import { DriverDocumentsService } from './driver-documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';

describe('DriverDocumentsService', () => {
  const applicationId = 'driver-application-1';
  const file = {
    buffer: Buffer.from('fake'),
    mimetype: 'image/jpeg',
    originalname: 'license.jpg',
    size: 1024,
  };

  function buildService(existingDocument: unknown = null) {
    const prisma = {
      driverDocument: {
        findUnique: jest.fn().mockResolvedValue(existingDocument),
        upsert: jest.fn().mockResolvedValue({
          id: 'doc-1',
          type: DriverDocumentType.DRIVERS_LICENSE,
          originalFilename: 'license.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          uploadedAt: new Date(),
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const storage = {
      save: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue(Buffer.from('data')),
      delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<StorageService>;

    return {
      service: new DriverDocumentsService(prisma, storage),
      prisma,
      storage,
    };
  }

  describe('isAllowedMimeType', () => {
    it.each(['image/jpeg', 'image/png', 'application/pdf'])(
      'allows %s',
      (mime) => {
        expect(DriverDocumentsService.isAllowedMimeType(mime)).toBe(true);
      },
    );

    it('rejects an unsupported mime type', () => {
      expect(DriverDocumentsService.isAllowedMimeType('application/exe')).toBe(
        false,
      );
    });
  });

  describe('upload', () => {
    it('rejects an unsupported file type before touching the DB', async () => {
      const { service, prisma } = buildService();
      await expect(
        service.upload(applicationId, DriverDocumentType.DRIVERS_LICENSE, {
          ...file,
          mimetype: 'application/exe',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.driverDocument.findUnique).not.toHaveBeenCalled();
    });

    it('saves the file under the application and upserts the record', async () => {
      const { service, storage, prisma } = buildService();
      const result = await service.upload(
        applicationId,
        DriverDocumentType.DRIVERS_LICENSE,
        file,
      );

      expect(storage.save).toHaveBeenCalledWith(
        expect.stringContaining(
          `driver-documents/${applicationId}/DRIVERS_LICENSE-`,
        ),
        file.buffer,
      );
      expect(prisma.driverDocument.upsert as jest.Mock).toHaveBeenCalled();
      expect(result).not.toHaveProperty('storageKey');
    });

    it('deletes the old file when replacing an existing document', async () => {
      const oldKey = `driver-documents/${applicationId}/DRIVERS_LICENSE-old.jpg`;
      const { service, storage } = buildService({ storageKey: oldKey });
      await service.upload(
        applicationId,
        DriverDocumentType.DRIVERS_LICENSE,
        file,
      );
      expect(storage.delete).toHaveBeenCalledWith(oldKey);
    });
  });

  describe('uploadedTypes', () => {
    it('is empty when nothing has been uploaded', async () => {
      const { service } = buildService();
      await expect(service.uploadedTypes(applicationId)).resolves.toEqual(
        new Set(),
      );
    });

    it('reports every type already on the application', async () => {
      const { service, prisma } = buildService();
      (prisma.driverDocument.findMany as jest.Mock).mockResolvedValue([
        { type: DriverDocumentType.DRIVERS_LICENSE },
        { type: DriverDocumentType.PROFILE_PHOTO },
      ]);
      await expect(service.uploadedTypes(applicationId)).resolves.toEqual(
        new Set([
          DriverDocumentType.DRIVERS_LICENSE,
          DriverDocumentType.PROFILE_PHOTO,
        ]),
      );
    });
  });

  describe('getFileBuffer', () => {
    it('throws NotFoundException for a missing document', async () => {
      // buildService()'s default driverDocument.findUnique already resolves
      // null (the "no existing document" case for upload tests above).
      const { service } = buildService();
      await expect(service.getFileBuffer('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
