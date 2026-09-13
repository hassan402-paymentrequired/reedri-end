import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DriverDocumentType } from '@prisma/client';
import {
  DriverDocumentsService,
  REQUIRED_DOCUMENT_TYPES,
} from './driver-documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';

describe('DriverDocumentsService', () => {
  const profile = { id: 'driver-profile-1', userId: 'driver-user-1' };
  const file = {
    buffer: Buffer.from('fake'),
    mimetype: 'image/jpeg',
    originalname: 'license.jpg',
    size: 1024,
  };

  function buildService(existingDocument: unknown = null) {
    const prisma = {
      driverProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
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
        service.upload('driver-user-1', DriverDocumentType.DRIVERS_LICENSE, {
          ...file,
          mimetype: 'application/exe',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.driverProfile.findUnique).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the driver has no profile', async () => {
      const { service, prisma } = buildService();
      (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.upload(
          'driver-user-1',
          DriverDocumentType.DRIVERS_LICENSE,
          file,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('saves the file and upserts the document record', async () => {
      const { service, storage, prisma } = buildService();
      const result = await service.upload(
        'driver-user-1',
        DriverDocumentType.DRIVERS_LICENSE,
        file,
      );

      expect(storage.save).toHaveBeenCalledWith(
        expect.stringContaining(
          'driver-documents/driver-profile-1/DRIVERS_LICENSE-',
        ),
        file.buffer,
      );
      expect(prisma.driverDocument.upsert as jest.Mock).toHaveBeenCalled();
      expect(result).not.toHaveProperty('storageKey');
    });

    it('deletes the old file when replacing an existing document', async () => {
      const { service, storage } = buildService({
        storageKey: 'driver-documents/driver-profile-1/DRIVERS_LICENSE-old.jpg',
      });
      await service.upload(
        'driver-user-1',
        DriverDocumentType.DRIVERS_LICENSE,
        file,
      );
      expect(storage.delete).toHaveBeenCalledWith(
        'driver-documents/driver-profile-1/DRIVERS_LICENSE-old.jpg',
      );
    });
  });

  describe('missingRequiredTypes', () => {
    it('returns all required types when nothing has been uploaded', async () => {
      const { service } = buildService();
      const missing = await service.missingRequiredTypes('driver-profile-1');
      expect(missing).toEqual(REQUIRED_DOCUMENT_TYPES);
    });

    it('excludes types that have already been uploaded', async () => {
      const { service, prisma } = buildService();
      (prisma.driverDocument.findMany as jest.Mock).mockResolvedValue([
        { type: DriverDocumentType.DRIVERS_LICENSE },
        { type: DriverDocumentType.PROFILE_PHOTO },
      ]);
      const missing = await service.missingRequiredTypes('driver-profile-1');
      expect(missing).toEqual([
        DriverDocumentType.VEHICLE_REGISTRATION,
        DriverDocumentType.PROOF_OF_INSURANCE,
      ]);
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
