import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class VerifyDriverDto {
  @ApiProperty()
  @IsBoolean()
  isVerified: boolean;
}
