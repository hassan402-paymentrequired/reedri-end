import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function mockContext(user?: { userId: string; role: Role }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows access when no roles are required', () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(mockContext())).toBe(true);
  });

  it('allows access when the user has one of the required roles', () => {
    const reflector = {
      getAllAndOverride: () => [Role.DRIVER],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const ctx = mockContext({ userId: 'u1', role: Role.DRIVER });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('denies access when the user does not have a required role', () => {
    const reflector = {
      getAllAndOverride: () => [Role.DRIVER],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    const ctx = mockContext({ userId: 'u1', role: Role.RIDER });
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('denies access when there is no authenticated user', () => {
    const reflector = {
      getAllAndOverride: () => [Role.DRIVER],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(mockContext(undefined))).toBe(false);
  });
});
