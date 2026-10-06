import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';

// Everyone registers the same way and is rider-capable immediately. Becoming a
// driver is an opt-in flow afterwards (see DriverApplicationService), and admins
// are created out-of-band via prisma/seed.ts.
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
}
