import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Body,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverDocumentsService } from '../drivers/driver-documents.service';
import { DriverApplicationService } from '../driver-application/driver-application.service';
import { SkipResponseEnvelope } from '../common/decorators/skip-response-envelope.decorator';
import { ReviewApplicationDto } from '../driver-application/dto/review-application.dto';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto';

// TODO(admin-portal): this whole controller is the minimum needed to verify a
// driver during MVP. Admins are moving to their own admin_users table with a
// proper portal; at that point the Role.ADMIN gate below and the Role enum
// member itself go away, and these endpoints get rebuilt against it.
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/driver-applications')
export class AdminController {
  constructor(
    private readonly driverApplicationService: DriverApplicationService,
    private readonly driverDocumentsService: DriverDocumentsService,
  ) {}

  @Get()
  listApplications(@Query() query: ListApplicationsQueryDto) {
    return this.driverApplicationService.listForReview(query.status);
  }

  @Patch(':id/review')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewApplicationDto,
  ) {
    return this.driverApplicationService.review(id, dto);
  }

  @Get(':id/documents')
  listDocuments(@Param('id', ParseUUIDPipe) id: string) {
    return this.driverApplicationService.listDocumentsForApplication(id);
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
