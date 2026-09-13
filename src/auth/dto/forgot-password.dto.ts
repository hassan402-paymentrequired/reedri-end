import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: '+2348012345678' })
  @IsPhoneNumber()
  phone: string;
}
