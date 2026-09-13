import { Body, Controller, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { DriversService } from './drivers.service';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@ApiTags('driver')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DRIVER)
@Controller('driver')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

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
}
