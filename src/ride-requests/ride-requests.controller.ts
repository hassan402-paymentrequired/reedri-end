import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { RideRequestsService } from './ride-requests.service';
import { CreateRideRequestDto } from './dto/create-ride-request.dto';
import { CancelRideRequestDto } from './dto/cancel-ride-request.dto';

@ApiTags('ride-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ride-requests')
export class RideRequestsController {
  constructor(private readonly rideRequestsService: RideRequestsService) {}

  @Roles(Role.RIDER)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRideRequestDto,
  ) {
    return this.rideRequestsService.create(user.userId, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rideRequestsService.findOneForUser(id, user);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelRideRequestDto,
  ) {
    return this.rideRequestsService.cancel(id, user, dto.reason);
  }
}
