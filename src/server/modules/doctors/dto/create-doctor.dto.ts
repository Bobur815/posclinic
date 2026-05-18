import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDoctorDto {
  @ApiProperty({ example: 'Sardor Mirzayev' })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiPropertyOptional({ example: 'Terapevt' })
  @IsString()
  @IsOptional()
  specialty?: string;

  @ApiPropertyOptional({ example: '+998901000010' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'DOC-2020-0045' })
  @IsString()
  @IsOptional()
  licenseNo?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
