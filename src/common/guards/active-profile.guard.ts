import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ActiveProfile } from '@prisma/client';
import { REQUIRE_PROFILE_KEY } from '../decorators/require-profile.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../auth/types/jwt-payload.type';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

/**
 * Gates a route on which mode the user is currently in. Both halves of a
 * driver check — the active profile and the existence of a verified
 * DriverProfile — are read from the database rather than the access token:
 * a token minted before a profile switch (or before verification was
 * revoked) must not be able to act in a mode the user is no longer in.
 */
@Injectable()
export class ActiveProfileGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ActiveProfile>(
      REQUIRE_PROFILE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user) {
      throw new ForbiddenException();
    }

    const record = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        activeProfile: true,
        driverProfile: { select: { id: true } },
      },
    });

    if (!record || record.activeProfile !== required) {
      throw new ForbiddenException(
        required === ActiveProfile.DRIVER
          ? 'Switch to driver mode to perform this action'
          : 'Switch to rider mode to perform this action',
      );
    }

    // A DriverProfile only ever exists for a verified application, so its
    // presence is the verification check.
    if (required === ActiveProfile.DRIVER && !record.driverProfile) {
      throw new ForbiddenException('Complete driver verification first');
    }

    return true;
  }
}
