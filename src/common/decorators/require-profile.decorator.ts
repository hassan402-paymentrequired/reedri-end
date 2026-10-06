import { SetMetadata } from '@nestjs/common';
import { ActiveProfile } from '@prisma/client';

export const REQUIRE_PROFILE_KEY = 'requireProfile';
export const RequireProfile = (profile: ActiveProfile) =>
  SetMetadata(REQUIRE_PROFILE_KEY, profile);
