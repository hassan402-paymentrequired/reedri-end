import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNotEmpty, IsString, MaxDate } from 'class-validator';

// Nobody under 18 can drive; this also rejects obviously bogus future dates.
const eighteenYearsAgo = (): Date => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date;
};

export class SubmitPersonalInfoDto {
  @ApiProperty({ example: 'Adaeze Chinwe Obi' })
  @IsString()
  @IsNotEmpty()
  fullLegalName: string;

  @ApiProperty({ example: '1994-03-21', type: String, format: 'date' })
  @Type(() => Date)
  @IsDate()
  @MaxDate(eighteenYearsAgo, { message: 'Drivers must be at least 18' })
  dateOfBirth: Date;

  @ApiProperty({ example: '14 Adeola Odeku Street, Victoria Island, Lagos' })
  @IsString()
  @IsNotEmpty()
  residentialAddress: string;
}
