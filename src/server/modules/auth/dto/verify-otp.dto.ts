import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'OTP code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP code must contain only digits' })
  @IsNotEmpty({ message: 'OTP code is required' })
  code!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'OTP code must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP code must contain only digits' })
  @IsNotEmpty({ message: 'OTP code is required' })
  code!: string;

  @ApiProperty({ example: 'newStrongPassword123' })
  @IsString()
  @MinLength(6, { message: 'New password must be at least 6 characters long' })
  @IsNotEmpty({ message: 'New password is required' })
  newPassword!: string;
}

export class RequestOtpForEmailDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @ApiProperty({
    example: 'EMAIL_VERIFICATION',
    enum: ['EMAIL_VERIFICATION', 'PASSWORD_RESET'],
    description: 'Type of OTP request',
  })
  @IsOptional()
  @IsString()
  type?: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
}
