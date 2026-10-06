import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ActiveProfile } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ActiveProfileGuard } from '../common/guards/active-profile.guard';
import { RequireProfile } from '../common/decorators/require-profile.decorator';
import { MatchingService } from './matching.service';
import { NearbyDriversQueryDto } from './dto/nearby-drivers-query.dto';
import { NearbyDriverResponseDto } from './dto/nearby-driver-response.dto';

@ApiTags('matching')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveProfileGuard)
@Controller('matching')
export class MatchingController {
  constructor(private readonly matchingService: MatchingService) {}

  /**
   * Initial snapshot for the rider's live map. Live movement after this
   * comes from the WS `rider:track:subscribe` event (see RealtimeGateway),
   * not from polling this endpoint.
   */
  @RequireProfile(ActiveProfile.RIDER)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('nearby-drivers')
  async nearbyDrivers(@Query() query: NearbyDriversQueryDto) {
    const drivers = await this.matchingService.findNearbyDriverLocations(
      query.lat,
      query.lng,
      query.radiusKm,
    );
    return drivers.map((d) => NearbyDriverResponseDto.from(d));
  }
}
