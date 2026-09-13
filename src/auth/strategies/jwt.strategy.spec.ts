import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const config = {
    getOrThrow: () => 'test-secret',
  } as unknown as ConfigService;
  const strategy = new JwtStrategy(config);

  it('maps a valid payload to an AuthenticatedUser', () => {
    const result = strategy.validate({ sub: 'user-1', role: Role.RIDER });
    expect(result).toEqual({ userId: 'user-1', role: Role.RIDER });
  });

  it('rejects a payload missing sub', () => {
    expect(() => strategy.validate({ sub: '', role: Role.RIDER })).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a payload missing role', () => {
    expect(() =>
      strategy.validate({ sub: 'user-1' } as unknown as {
        sub: string;
        role: Role;
      }),
    ).toThrow(UnauthorizedException);
  });
});
