import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { DriversService } from '../drivers/drivers.service';
import { DriverDocumentsService } from '../drivers/driver-documents.service';
import { SkipResponseEnvelope } from '../common/decorators/skip-response-envelope.decorator';
import { VerifyDriverDto } from './dto/verify-driver.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/drivers')
export class AdminController {
  constructor(
    private readonly driversService: DriversService,
    private readonly driverDocumentsService: DriverDocumentsService,
  ) {}

  @Get()
  listDrivers() {
    return this.driversService.listAll();
  }

  @Patch(':driverProfileId/verify')
  verifyDriver(
    @Param('driverProfileId', ParseUUIDPipe) driverProfileId: string,
    @Body() dto: VerifyDriverDto,
  ) {
    return this.driversService.setVerified(driverProfileId, dto.isVerified);
  }

  @Get(':driverProfileId/documents')
  listDocuments(
    @Param('driverProfileId', ParseUUIDPipe) driverProfileId: string,
  ) {
    return this.driverDocumentsService.listForDriverProfile(driverProfileId);
  }

  @SkipResponseEnvelope()
  @Get('documents/:documentId/file')
  async downloadDocument(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType, filename } =
      await this.driverDocumentsService.getFileBuffer(documentId);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
    });
    res.send(buffer);
  }
}
