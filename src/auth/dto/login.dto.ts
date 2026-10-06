import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: '+2348012345678' })
  @IsPhoneNumber()
  declare phone: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  declare password: string;
}
