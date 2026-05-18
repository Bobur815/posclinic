import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterTenantDto {
  @ApiProperty({ example: 'Najot Shifo Klinikasi', description: 'Organization name' })
  @IsString()
  @IsNotEmpty()
  organizationName!: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsString()
  @IsOptional()
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'Tashkent', default: 'Tashkent' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ example: 'owner@clinic.uz', description: 'Admin email (used for login)' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'strongpassword', description: 'Minimum 8 characters' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Aziza' })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({ example: 'Karimova' })
  @IsString()
  @IsNotEmpty()
  lastName!: string;
}

export class ElectronSetupDto {
  @ApiProperty({ example: 'PC-A1B2C3', description: '8-character clinic code from registration' })
  @IsString()
  @IsNotEmpty()
  clinicCode!: string;

  @ApiProperty({ example: 'owner@clinic.uz' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'strongpassword' })
  @IsString()
  @MinLength(6)
  password!: string;
}
