import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { DriversService } from './drivers.service';
import { DriverDocumentsService } from './driver-documents.service';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';

// Read directly from process.env (not ConfigService) because
// @UseInterceptors(FileInterceptor(...)) options are fixed at
// class-decoration time, before Nest's DI container exists — same
// constraint as RealtimeGateway's CORS option. `import 'dotenv/config'`
// as the first line of main.ts guarantees .env is loaded before this runs.
const maxUploadSizeBytes =
  Number(process.env.MAX_UPLOAD_SIZE_MB ?? 10) * 1024 * 1024;

@ApiTags('driver')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DRIVER)
@Controller('driver')
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly driverDocumentsService: DriverDocumentsService,
  ) {}

  @Patch('status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.driversService.setOnlineStatus(user.userId, dto.isOnline);
  }

  /**
   * REST fallback for location updates if the WebSocket connection briefly
   * drops. The primary path is the `driver:location:update` WS event.
   */
  @Patch('location')
  updateLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.driversService.updateLocation(user.userId, dto.lat, dto.lng);
  }

  @ApiConsumes('multipart/form-data')
  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: maxUploadSizeBytes,
        files: 1,
        // Caps the two known multer DoS vectors around field name/count
        // handling — see README's dependency-pins section for context.
        fields: 1,
        fieldNameSize: 100,
      },
      fileFilter: (_req, file, callback) => {
        if (!DriverDocumentsService.isAllowedMimeType(file.mimetype)) {
          callback(
            new BadRequestException(
              'Unsupported file type — use JPEG, PNG, or PDF',
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.driverDocumentsService.upload(user.userId, dto.type, file);
  }

  @Get('documents')
  listDocuments(@CurrentUser() user: AuthenticatedUser) {
    return this.driverDocumentsService.listOwn(user.userId);
  }
}
