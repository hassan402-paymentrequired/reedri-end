import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Role } from '@prisma/client';

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

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

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
