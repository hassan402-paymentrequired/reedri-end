import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DriverApplication,
  DriverApplicationStatus,
  DriverDocumentType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DriverDocumentsService,
  UploadableFile,
} from '../drivers/driver-documents.service';
import { SubmitPersonalInfoDto } from './dto/submit-personal-info.dto';
import { SubmitLicenseDto } from './dto/submit-license.dto';
import { SubmitVehicleDto } from './dto/submit-vehicle.dto';
import { ReviewApplicationDto } from './dto/review-application.dto';
import { DriverApplicationResponseDto } from './dto/driver-application-response.dto';
import { DriverApplicationStatusResponseDto } from './dto/driver-application-status-response.dto';

export const REQUIRED_DOCUMENT_TYPES: DriverDocumentType[] = [
  DriverDocumentType.DRIVERS_LICENSE,
  DriverDocumentType.VEHICLE_REGISTRATION,
  DriverDocumentType.VEHICLE_PHOTO,
];

// Accepted whenever an applicant has them, but never required.
export const OPTIONAL_DOCUMENT_TYPES: DriverDocumentType[] = [
  DriverDocumentType.PROOF_OF_INSURANCE,
  DriverDocumentType.PROFILE_PHOTO,
];

// Which step the app should resume at for each in-progress status.
const RESUME_STEP: Partial<Record<DriverApplicationStatus, number>> = {
  [DriverApplicationStatus.NOT_STARTED]: 1,
  [DriverApplicationStatus.PERSONAL_INFO_SUBMITTED]: 2,
  [DriverApplicationStatus.LICENSE_SUBMITTED]: 3,
  [DriverApplicationStatus.VEHICLE_SUBMITTED]: 3,
  [DriverApplicationStatus.REJECTED]: 1,
};

@Injectable()
export class DriverApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DriverDocumentsService,
  ) {}

  /**
   * Entry point for "Become a driver". Idempotent: returns the existing
   * application if there is one, and clears a rejection so the applicant can
   * work through the steps again.
   */
  async start(userId: string) {
    const existing = await this.prisma.driverApplication.findUnique({
      where: { userId },
    });

    if (!existing) {
      const created = await this.prisma.driverApplication.create({
        data: { userId },
      });
      return DriverApplicationResponseDto.from(created);
    }

    if (
      existing.status === DriverApplicationStatus.UNDER_REVIEW ||
      existing.status === DriverApplicationStatus.VERIFIED
    ) {
      throw new ConflictException(
        'Your driver application has already been submitted',
      );
    }

    if (existing.status === DriverApplicationStatus.REJECTED) {
      // Previously submitted data is kept so the applicant can correct what
      // was wrong instead of retyping everything; each step overwrites its
      // own fields and document uploads replace in place.
      const reset = await this.prisma.driverApplication.update({
        where: { id: existing.id },
        data: {
          status: DriverApplicationStatus.NOT_STARTED,
          rejectionReason: null,
          submittedAt: null,
          reviewedAt: null,
        },
      });
      return DriverApplicationResponseDto.from(reset);
    }

    return DriverApplicationResponseDto.from(existing);
  }

  async submitPersonalInfo(userId: string, dto: SubmitPersonalInfoDto) {
    const application = await this.loadEditable(userId);
    const updated = await this.prisma.driverApplication.update({
      where: { id: application.id },
      data: {
        fullLegalName: dto.fullLegalName,
        dateOfBirth: dto.dateOfBirth,
        residentialAddress: dto.residentialAddress,
        status: DriverApplicationStatus.PERSONAL_INFO_SUBMITTED,
      },
    });
    return DriverApplicationResponseDto.from(updated);
  }

  async submitLicense(
    userId: string,
    dto: SubmitLicenseDto,
    licenseImage: UploadableFile,
  ) {
    const application = await this.loadEditable(userId);

    // The upload lands first: if storage fails, the status must not advance.
    await this.documents.upload(
      application.id,
      DriverDocumentType.DRIVERS_LICENSE,
      licenseImage,
    );

    const updated = await this.prisma.driverApplication.update({
      where: { id: application.id },
      data: {
        licenseNumber: dto.licenseNumber,
        licenseExpiryDate: dto.licenseExpiryDate,
        status: DriverApplicationStatus.LICENSE_SUBMITTED,
      },
    });
    return DriverApplicationResponseDto.from(updated);
  }

  async submitVehicle(
    userId: string,
    dto: SubmitVehicleDto,
    files: Partial<Record<DriverDocumentType, UploadableFile>>,
  ) {
    const application = await this.loadEditable(userId);
    await this.assertPlateNumberAvailable(dto.plateNumber, application.id);

    for (const [type, file] of Object.entries(files)) {
      await this.documents.upload(
        application.id,
        type as DriverDocumentType,
        file,
      );
    }

    const uploaded = await this.documents.uploadedTypes(application.id);
    const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !uploaded.has(t));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required document(s): ${missing.join(', ')}`,
      );
    }

    // All three steps are in — the application goes straight to review.
    const updated = await this.prisma.driverApplication.update({
      where: { id: application.id },
      data: {
        vehicleMake: dto.vehicleMake,
        vehicleModel: dto.vehicleModel,
        vehicleYear: dto.vehicleYear,
        vehicleColor: dto.vehicleColor,
        plateNumber: dto.plateNumber,
        registrationExpiryDate: dto.registrationExpiryDate,
        status: DriverApplicationStatus.UNDER_REVIEW,
        submittedAt: new Date(),
      },
    });
    return DriverApplicationResponseDto.from(updated);
  }

  /**
   * Optional extras (insurance, profile photo) can be added at any point,
   * including after submission — they never gate verification.
   */
  async uploadOptionalDocument(
    userId: string,
    type: DriverDocumentType,
    file: UploadableFile,
  ) {
    if (!OPTIONAL_DOCUMENT_TYPES.includes(type)) {
      throw new BadRequestException(
        `${type} is submitted as part of the application steps, not here`,
      );
    }
    const application = await this.findByUserId(userId);
    return this.documents.upload(application.id, type, file);
  }

  async getStatus(userId: string) {
    const application = await this.findByUserId(userId);
    return DriverApplicationStatusResponseDto.from({
      status: application.status,
      currentStep: RESUME_STEP[application.status] ?? null,
      rejectionReason: application.rejectionReason,
    });
  }

  async listOwnDocuments(userId: string) {
    const application = await this.findByUserId(userId);
    return this.documents.listForApplication(application.id);
  }

  // TODO(admin-portal): callers become authenticated admin_users rows rather
  // than a users-table record carrying Role.ADMIN.
  async listForReview(status: DriverApplicationStatus) {
    const applications = await this.prisma.driverApplication.findMany({
      where: { status },
      orderBy: { submittedAt: 'asc' },
    });
    return applications.map((a) => DriverApplicationResponseDto.from(a));
  }

  async listDocumentsForApplication(applicationId: string) {
    await this.findById(applicationId);
    return this.documents.listForApplication(applicationId);
  }

  /**
   * Manual review. Approving is what brings a DriverProfile into existence —
   * there is no other path that creates one.
   */
  // TODO(admin-portal): see listForReview.
  async review(applicationId: string, dto: ReviewApplicationDto) {
    const application = await this.findById(applicationId);
    if (application.status !== DriverApplicationStatus.UNDER_REVIEW) {
      throw new ConflictException(
        `Only applications under review can be reviewed (this one is ${application.status})`,
      );
    }

    if (dto.decision === DriverApplicationStatus.REJECTED) {
      const rejected = await this.prisma.driverApplication.update({
        where: { id: application.id },
        data: {
          status: DriverApplicationStatus.REJECTED,
          rejectionReason: dto.rejectionReason,
          reviewedAt: new Date(),
        },
      });
      return DriverApplicationResponseDto.from(rejected);
    }

    const [verified] = await this.prisma.$transaction([
      this.prisma.driverApplication.update({
        where: { id: application.id },
        data: {
          status: DriverApplicationStatus.VERIFIED,
          rejectionReason: null,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.driverProfile.create({
        data: {
          userId: application.userId,
          driverApplicationId: application.id,
        },
      }),
    ]);
    return DriverApplicationResponseDto.from(verified);
  }

  private async findByUserId(userId: string): Promise<DriverApplication> {
    const application = await this.prisma.driverApplication.findUnique({
      where: { userId },
    });
    if (!application) {
      throw new NotFoundException('No driver application started');
    }
    return application;
  }

  private async findById(id: string): Promise<DriverApplication> {
    const application = await this.prisma.driverApplication.findUnique({
      where: { id },
    });
    if (!application) {
      throw new NotFoundException('Driver application not found');
    }
    return application;
  }

  /** An application stops accepting step submissions once it's been sent for review. */
  private async loadEditable(userId: string): Promise<DriverApplication> {
    const application = await this.findByUserId(userId);
    if (
      application.status === DriverApplicationStatus.UNDER_REVIEW ||
      application.status === DriverApplicationStatus.VERIFIED
    ) {
      throw new ConflictException(
        'Your driver application has already been submitted',
      );
    }
    if (application.status === DriverApplicationStatus.REJECTED) {
      throw new ConflictException(
        'Your application was rejected — restart it before resubmitting',
      );
    }
    return application;
  }

  private async assertPlateNumberAvailable(
    plateNumber: string,
    ownApplicationId: string,
  ): Promise<void> {
    const existing = await this.prisma.driverApplication.findUnique({
      where: { plateNumber },
      select: { id: true },
    });
    if (existing && existing.id !== ownApplicationId) {
      throw new ConflictException('Plate number already registered');
    }
  }
}
