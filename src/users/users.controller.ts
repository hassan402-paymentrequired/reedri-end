import { Body, Controller, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { UsersService } from './users.service';
import { UpdateActiveProfileDto } from './dto/update-active-profile.dto';

@ApiTags('user')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('active-profile')
  setActiveProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateActiveProfileDto,
  ) {
    return this.usersService.setActiveProfile(user.userId, dto.profile);
  }
}
