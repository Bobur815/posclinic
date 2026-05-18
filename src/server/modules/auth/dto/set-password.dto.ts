import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class SetPasswordDto {
  @ApiProperty({ description: 'Short-lived token returned by verify-otp for new users' })
  @IsString()
  @IsNotEmpty()
  registrationToken!: string;

  @ApiProperty({ example: 'StrongPass123', minLength: 8 })
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

export class CreateClinicDto {
  @ApiProperty({ description: 'Short-lived token returned by /auth/set-password' })
  @IsString()
  @IsNotEmpty()
  setupToken!: string;

  @ApiProperty({ example: 'Najot Shifo Klinikasi' })
  @IsString()
  @IsNotEmpty()
  organizationName!: string;

  @ApiPropertyOptional({ example: 'Najot Shifo Klinikasi' })
  @IsOptional()
  @IsString()
  organizationNameUz?: string;

  @ApiPropertyOptional({ example: 'Клиника Наджот Шифо' })
  @IsOptional()
  @IsString()
  organizationNameRu?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ example: "Ko'yluk ko'chasi 12-uy" })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Tashkent', default: 'Tashkent' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Tashkent viloyati' })
  @IsOptional()
  @IsString()
  region?: string;
}
