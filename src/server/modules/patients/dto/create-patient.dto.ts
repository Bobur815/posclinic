import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePatientDto {
  @ApiProperty({ example: 'Alisher Nazarov' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ example: '+998901100001' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({ example: '1985-03-15' })
  @IsDateString()
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ example: 'B(III)+' })
  @IsString()
  @IsOptional()
  bloodType?: string;

  @ApiPropertyOptional({ example: 'Penicillin' })
  @IsString()
  @IsOptional()
  allergies?: string;

  @ApiPropertyOptional({ example: 'Yunusobod tumani' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'Toshkent' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'Doimiy mijoz' })
  @IsString()
  @IsOptional()
  notes?: string;
}
