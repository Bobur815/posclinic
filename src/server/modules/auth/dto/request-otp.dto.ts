import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: 'ergashevboburmirzo815@gmail.com' })
  @IsEmail({}, { message: 'invalidEmail' })
  @IsNotEmpty({ message: 'missingEmail' })
  email!: string;
}
