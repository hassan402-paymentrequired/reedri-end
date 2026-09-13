import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'crypto';
import ms, { type StringValue } from 'ms';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { DriversService } from '../drivers/drivers.service';
import { SmsService } from '../common/sms/sms.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TokenPairResponseDto } from './dto/token-pair-response.dto';
import { UserResponseDto } from './dto/user-response.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly driversService: DriversService,
    private readonly smsService: SmsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPairResponseDto> {
    const existing = await this.usersService.findByPhone(dto.phone);
    if (existing) {
      throw new ConflictException('Phone number already registered');
    }
    if (dto.role === Role.DRIVER) {
      await this.driversService.assertPlateNumberAvailable(dto.plateNumber!);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name,
          phone: dto.phone,
          password: passwordHash,
          role: dto.role,
        },
      });

      if (dto.role === Role.DRIVER) {
        await this.driversService.createProfile(tx, {
          userId: created.id,
          vehicleMake: dto.vehicleMake!,
          vehicleModel: dto.vehicleModel!,
          plateNumber: dto.plateNumber!,
        });
      }

      return created;
    });

    return this.issueTokenPair(user.id, user.role);
  }

  async login(dto: LoginDto): Promise<TokenPairResponseDto> {
    const user = await this.usersService.findByPhone(dto.phone);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokenPair(user.id, user.role);
  }

  async refresh(refreshToken: string): Promise<TokenPairResponseDto> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: revoke the used token so it can't be replayed.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.usersService.findById(stored.userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.issueTokenPair(user.id, user.role);
  }

  async me(userId: string): Promise<UserResponseDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return UserResponseDto.from(user);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.usersService.findByPhone(dto.phone);
    if (!user) {
      // Don't reveal whether this phone number is registered.
      return;
    }

    const code = randomInt(100000, 1000000).toString();
    const expiresIn = this.config.get<string>(
      'PASSWORD_RESET_CODE_EXPIRES_IN',
      '15m',
    ) as StringValue;

    await this.prisma.$transaction([
      // A new code invalidates any still-outstanding one for this user, so
      // at most one is ever valid at a time.
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          codeHash: this.hashToken(code),
          expiresAt: new Date(Date.now() + ms(expiresIn)),
        },
      }),
    ]);

    await this.smsService.send(
      user.phone,
      `Your Reedr password reset code is ${code}. It expires in ${expiresIn}.`,
    );
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.usersService.findByPhone(dto.phone);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired reset code');
    }

    const stored = await this.prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        codeHash: this.hashToken(dto.code),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!stored) {
      throw new UnauthorizedException('Invalid or expired reset code');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { password: passwordHash },
      }),
      // A password reset means every existing session should die too.
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(
    userId: string,
    role: Role,
  ): Promise<TokenPairResponseDto> {
    const accessTtl = this.config.get<string>(
      'JWT_ACCESS_EXPIRES_IN',
      '15m',
    ) as StringValue;
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, role },
      { expiresIn: accessTtl },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const refreshTtl = this.config.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '30d',
    ) as StringValue;
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + ms(refreshTtl)),
      },
    });

    return TokenPairResponseDto.from({ accessToken, refreshToken });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
