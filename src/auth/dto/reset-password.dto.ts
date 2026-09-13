import { ApiProperty } from '@nestjs/swagger';
import {
  IsPhoneNumber,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: '+2348012345678' })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({
    example: '123456',
    description: 'The 6-digit code sent by SMS',
  })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
