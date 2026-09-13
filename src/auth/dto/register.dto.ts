import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Role } from '@prisma/client';

// Deliberately excludes Role.ADMIN — public registration must never be able
// to self-assign the admin role. Admins are created out-of-band (see
// prisma/seed.ts) and can only be created/promoted by an existing admin.
export const PUBLIC_REGISTRATION_ROLES = [Role.RIDER, Role.DRIVER] as const;

export class RegisterDto {
  @ApiProperty({ example: 'Ada Obi' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '+2348012345678' })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: PUBLIC_REGISTRATION_ROLES })
  @IsIn(PUBLIC_REGISTRATION_ROLES)
  role: (typeof PUBLIC_REGISTRATION_ROLES)[number];

  // Required only when role === DRIVER.
  @ApiPropertyOptional({ example: 'Toyota' })
  @ValidateIf((dto: RegisterDto) => dto.role === Role.DRIVER)
  @IsString()
  @IsNotEmpty()
  vehicleMake?: string;

  @ApiPropertyOptional({ example: 'Corolla' })
  @ValidateIf((dto: RegisterDto) => dto.role === Role.DRIVER)
  @IsString()
  @IsNotEmpty()
  vehicleModel?: string;

  @ApiPropertyOptional({ example: 'LAG-123-XY' })
  @ValidateIf((dto: RegisterDto) => dto.role === Role.DRIVER)
  @IsString()
  @IsNotEmpty()
  plateNumber?: string;
}
