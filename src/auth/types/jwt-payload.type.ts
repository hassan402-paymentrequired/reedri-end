import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  role: Role;
}

export interface AuthenticatedUser {
  userId: string;
  role: Role;
}
