import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveProfile } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveProfileGuard } from '../common/guards/active-profile.guard';
import { RequireProfile } from '../common/decorators/require-profile.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { TripsService } from './trips.service';
import { RatingsService } from '../ratings/ratings.service';
import { RateTripDto } from '../ratings/dto/rate-trip.dto';

@ApiTags('trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveProfileGuard)
@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly ratingsService: RatingsService,
  ) {}

  @RequireProfile(ActiveProfile.DRIVER)
  @Patch(':id/start')
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tripsService.start(id, user.userId);
  }

  @RequireProfile(ActiveProfile.DRIVER)
  @Patch(':id/complete')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tripsService.complete(id, user.userId);
  }

  @Post(':id/rating')
  rate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RateTripDto,
  ) {
    return this.ratingsService.rateTrip(id, user.userId, dto);
  }
}
