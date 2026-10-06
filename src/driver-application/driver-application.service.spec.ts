import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DriverApplicationStatus, DriverDocumentType } from '@prisma/client';
import { DriverApplicationService } from './driver-application.service';
import { PrismaService } from '../prisma/prisma.service';
import { DriverDocumentsService } from '../drivers/driver-documents.service';

describe('DriverApplicationService', () => {
  const application = {
    id: 'application-1',
    userId: 'user-1',
    status: DriverApplicationStatus.LICENSE_SUBMITTED,
    rejectionReason: null,
  };

  const file = {
    buffer: Buffer.from('fake'),
    mimetype: 'image/jpeg',
    originalname: 'photo.jpg',
    size: 1024,
  };

  const vehicleDto = {
    vehicleMake: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: 2018,
    vehicleColor: 'Silver',
    plateNumber: 'LAG-123-XY',
    registrationExpiryDate: new Date('2030-01-01'),
  };

  function buildService(
    overrides: {
      application?: unknown;
      uploadedTypes?: DriverDocumentType[];
      plateHolder?: unknown;
    } = {},
  ) {
    const current =
      'application' in overrides ? overrides.application : application;

    const prisma = {
      driverApplication: {
        findUnique: jest.fn(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(
            'plateNumber' in where ? (overrides.plateHolder ?? null) : current,
          ),
        ),
        create: jest.fn().mockResolvedValue({
          ...application,
          status: DriverApplicationStatus.NOT_STARTED,
        }),
        update: jest.fn((args: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...application, ...args.data }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      driverProfile: { create: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    } as unknown as PrismaService;

    const documents = {
      upload: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      uploadedTypes: jest
        .fn()
        .mockResolvedValue(new Set(overrides.uploadedTypes ?? [])),
      listForApplication: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<DriverDocumentsService>;

    return {
      service: new DriverApplicationService(prisma, documents),
      prisma,
      documents,
    };
  }

  const allRequired = [
    DriverDocumentType.DRIVERS_LICENSE,
    DriverDocumentType.VEHICLE_REGISTRATION,
    DriverDocumentType.VEHICLE_PHOTO,
  ];

  describe('start', () => {
    it('creates an application when the user has none', async () => {
      const { service, prisma } = buildService({ application: null });
      await service.start('user-1');
      expect(prisma.driverApplication.create).toHaveBeenCalledWith({
        data: { userId: 'user-1' },
      });
    });

    it('is idempotent for an in-progress application', async () => {
      const { service, prisma } = buildService();
      const result = await service.start('user-1');
      expect(prisma.driverApplication.create).not.toHaveBeenCalled();
      expect(result.status).toBe(DriverApplicationStatus.LICENSE_SUBMITTED);
    });

    it('clears the rejection so a rejected applicant can try again', async () => {
      const { service, prisma } = buildService({
        application: {
          ...application,
          status: DriverApplicationStatus.REJECTED,
          rejectionReason: 'Blurry license',
        },
      });
      await service.start('user-1');
      expect(prisma.driverApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DriverApplicationStatus.NOT_STARTED,
            rejectionReason: null,
          }),
        }),
      );
    });

    it('refuses to restart an application already under review', async () => {
      const { service } = buildService({
        application: {
          ...application,
          status: DriverApplicationStatus.UNDER_REVIEW,
        },
      });
      await expect(service.start('user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('step submissions', () => {
    it('requires an application to exist first', async () => {
      const { service } = buildService({ application: null });
      await expect(
        service.submitPersonalInfo('user-1', {
          fullLegalName: 'Ada Obi',
          dateOfBirth: new Date('1994-03-21'),
          residentialAddress: 'Lagos',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects edits once the application is under review', async () => {
      const { service } = buildService({
        application: {
          ...application,
          status: DriverApplicationStatus.UNDER_REVIEW,
        },
      });
      await expect(
        service.submitLicense(
          'user-1',
          {
            licenseNumber: 'LSD-1',
            licenseExpiryDate: new Date('2030-01-01'),
          },
          file,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('uploads the license image before advancing the status', async () => {
      const { service, documents, prisma } = buildService();
      await service.submitLicense(
        'user-1',
        { licenseNumber: 'LSD-1', licenseExpiryDate: new Date('2030-01-01') },
        file,
      );
      expect(documents.upload).toHaveBeenCalledWith(
        'application-1',
        DriverDocumentType.DRIVERS_LICENSE,
        file,
      );
      expect(prisma.driverApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: DriverApplicationStatus.LICENSE_SUBMITTED,
          }),
        }),
      );
    });

    it('sends the application straight to review once step 3 lands', async () => {
      const { service, prisma } = buildService({ uploadedTypes: allRequired });
      const result = await service.submitVehicle('user-1', vehicleDto, {
        [DriverDocumentType.VEHICLE_PHOTO]: file,
        [DriverDocumentType.VEHICLE_REGISTRATION]: file,
      });
      expect(result.status).toBe(DriverApplicationStatus.UNDER_REVIEW);
      expect(prisma.driverApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ submittedAt: expect.any(Date) }),
        }),
      );
    });

    it('refuses to submit for review with a required document missing', async () => {
      const { service } = buildService({
        uploadedTypes: [DriverDocumentType.DRIVERS_LICENSE],
      });
      await expect(
        service.submitVehicle('user-1', vehicleDto, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a plate number claimed by another application', async () => {
      const { service } = buildService({
        uploadedTypes: allRequired,
        plateHolder: { id: 'someone-elses-application' },
      });
      await expect(
        service.submitVehicle('user-1', vehicleDto, {}),
      ).rejects.toThrow(ConflictException);
    });

    it('allows a resubmission to keep its own plate number', async () => {
      const { service } = buildService({
        uploadedTypes: allRequired,
        plateHolder: { id: 'application-1' },
      });
      await expect(
        service.submitVehicle('user-1', vehicleDto, {}),
      ).resolves.toBeDefined();
    });
  });

  describe('optional documents', () => {
    it('refuses a type that belongs to one of the steps', async () => {
      const { service } = buildService();
      await expect(
        service.uploadOptionalDocument(
          'user-1',
          DriverDocumentType.DRIVERS_LICENSE,
          file,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts insurance even while the application is under review', async () => {
      const { service, documents } = buildService({
        application: {
          ...application,
          status: DriverApplicationStatus.UNDER_REVIEW,
        },
      });
      await service.uploadOptionalDocument(
        'user-1',
        DriverDocumentType.PROOF_OF_INSURANCE,
        file,
      );
      expect(documents.upload).toHaveBeenCalledWith(
        'application-1',
        DriverDocumentType.PROOF_OF_INSURANCE,
        file,
      );
    });
  });

  describe('getStatus', () => {
    it.each([
      [DriverApplicationStatus.NOT_STARTED, 1],
      [DriverApplicationStatus.PERSONAL_INFO_SUBMITTED, 2],
      [DriverApplicationStatus.LICENSE_SUBMITTED, 3],
      [DriverApplicationStatus.REJECTED, 1],
    ])('resumes %s at step %i', async (status, step) => {
      const { service } = buildService({
        application: { ...application, status },
      });
      await expect(service.getStatus('user-1')).resolves.toEqual(
        expect.objectContaining({ currentStep: step }),
      );
    });

    it('has no resume step once submitted', async () => {
      const { service } = buildService({
        application: {
          ...application,
          status: DriverApplicationStatus.UNDER_REVIEW,
        },
      });
      await expect(service.getStatus('user-1')).resolves.toEqual(
        expect.objectContaining({ currentStep: null }),
      );
    });
  });

  describe('review', () => {
    const underReview = {
      ...application,
      status: DriverApplicationStatus.UNDER_REVIEW,
    };

    it('creates the DriverProfile on approval', async () => {
      const { service, prisma } = buildService({ application: underReview });
      await service.review('application-1', {
        decision: DriverApplicationStatus.VERIFIED,
      });
      expect(prisma.driverProfile.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', driverApplicationId: 'application-1' },
      });
    });

    it('records the reason and creates no profile on rejection', async () => {
      const { service, prisma } = buildService({ application: underReview });
      await service.review('application-1', {
        decision: DriverApplicationStatus.REJECTED,
        rejectionReason: 'Blurry license',
      });
      expect(prisma.driverProfile.create).not.toHaveBeenCalled();
      expect(prisma.driverApplication.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rejectionReason: 'Blurry license' }),
        }),
      );
    });

    it('refuses to review an application that was never submitted', async () => {
      const { service } = buildService();
      await expect(
        service.review('application-1', {
          decision: DriverApplicationStatus.VERIFIED,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('cannot approve the same application twice', async () => {
      const { service } = buildService({
        application: {
          ...application,
          status: DriverApplicationStatus.VERIFIED,
        },
      });
      await expect(
        service.review('application-1', {
          decision: DriverApplicationStatus.VERIFIED,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
