import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { DriverDocumentType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { DriverDocumentsService } from '../drivers/driver-documents.service';
import { DriverApplicationService } from './driver-application.service';
import { SubmitPersonalInfoDto } from './dto/submit-personal-info.dto';
import { SubmitLicenseDto } from './dto/submit-license.dto';
import { SubmitVehicleDto } from './dto/submit-vehicle.dto';
import { UploadOptionalDocumentDto } from './dto/upload-optional-document.dto';

// Read directly from process.env (not ConfigService) because
// @UseInterceptors(FileInterceptor(...)) options are fixed at
// class-decoration time, before Nest's DI container exists — same
// constraint as RealtimeGateway's CORS option. `import 'dotenv/config'`
// as the first line of main.ts guarantees .env is loaded before this runs.
const maxUploadSizeBytes =
  Number(process.env.MAX_UPLOAD_SIZE_MB ?? 10) * 1024 * 1024;

const fileFilter = (
  _req: unknown,
  file: { mimetype: string },
  callback: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (!DriverDocumentsService.isAllowedMimeType(file.mimetype)) {
    callback(
      new BadRequestException('Unsupported file type — use JPEG, PNG, or PDF'),
      false,
    );
    return;
  }
  callback(null, true);
};

// Caps the two known multer DoS vectors around field name/count handling —
// see README's dependency-pins section for context.
const uploadLimits = (files: number, fields: number) => ({
  fileSize: maxUploadSizeBytes,
  files,
  fields,
  fieldNameSize: 100,
});

// Swagger can't infer the file fields from the DTOs: a doc-only property
// declared on a DTO class becomes an own property of the validated instance,
// which the global ValidationPipe's forbidNonWhitelisted then rejects. So each
// multipart endpoint describes its files in @ApiBody instead.
const BINARY = { type: 'string', format: 'binary' };

/**
 * The opt-in "Become a driver" flow. Open to any authenticated user — being
 * rider-only is exactly who applies here.
 */
@ApiTags('driver-application')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('driver-application')
export class DriverApplicationController {
  constructor(
    private readonly driverApplicationService: DriverApplicationService,
  ) {}

  @Post('start')
  start(@CurrentUser() user: AuthenticatedUser) {
    return this.driverApplicationService.start(user.userId);
  }

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.driverApplicationService.getStatus(user.userId);
  }

  @Post('personal-info')
  submitPersonalInfo(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitPersonalInfoDto,
  ) {
    return this.driverApplicationService.submitPersonalInfo(user.userId, dto);
  }

  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      allOf: [
        { $ref: '#/components/schemas/SubmitLicenseDto' },
        {
          type: 'object',
          properties: { licenseImage: BINARY },
          required: ['licenseImage'],
        },
      ],
    },
  })
  @Post('license')
  @UseInterceptors(
    FileInterceptor('licenseImage', {
      limits: uploadLimits(1, 10),
      fileFilter,
    }),
  )
  submitLicense(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitLicenseDto,
    @UploadedFile() licenseImage: Express.Multer.File,
  ) {
    if (!licenseImage) {
      throw new BadRequestException('A photo of your license is required');
    }
    return this.driverApplicationService.submitLicense(
      user.userId,
      dto,
      licenseImage,
    );
  }

  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      allOf: [
        { $ref: '#/components/schemas/SubmitVehicleDto' },
        {
          type: 'object',
          properties: {
            vehiclePhoto: BINARY,
            registrationDocument: BINARY,
            proofOfInsurance: BINARY,
            profilePhoto: BINARY,
          },
          required: ['vehiclePhoto', 'registrationDocument'],
        },
      ],
    },
  })
  @Post('vehicle')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'vehiclePhoto', maxCount: 1 },
        { name: 'registrationDocument', maxCount: 1 },
        { name: 'proofOfInsurance', maxCount: 1 },
        { name: 'profilePhoto', maxCount: 1 },
      ],
      { limits: uploadLimits(4, 20), fileFilter },
    ),
  )
  submitVehicle(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitVehicleDto,
    @UploadedFiles()
    files: Partial<Record<string, Express.Multer.File[]>>,
  ) {
    const byType: Partial<Record<DriverDocumentType, Express.Multer.File>> = {};
    const fieldToType = {
      vehiclePhoto: DriverDocumentType.VEHICLE_PHOTO,
      registrationDocument: DriverDocumentType.VEHICLE_REGISTRATION,
      proofOfInsurance: DriverDocumentType.PROOF_OF_INSURANCE,
      profilePhoto: DriverDocumentType.PROFILE_PHOTO,
    } as const;

    for (const [field, type] of Object.entries(fieldToType)) {
      const file = files?.[field]?.[0];
      if (file) {
        byType[type] = file;
      }
    }

    return this.driverApplicationService.submitVehicle(
      user.userId,
      dto,
      byType,
    );
  }

  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      allOf: [
        { $ref: '#/components/schemas/UploadOptionalDocumentDto' },
        {
          type: 'object',
          properties: { file: BINARY },
          required: ['file'],
        },
      ],
    },
  })
  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', { limits: uploadLimits(1, 5), fileFilter }),
  )
  uploadOptionalDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadOptionalDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.driverApplicationService.uploadOptionalDocument(
      user.userId,
      dto.type,
      file,
    );
  }

  @Get('documents')
  listDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.driverApplicationService.listOwnDocuments(user.userId);
  }
}
