import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateServiceDto {
  @ApiProperty({ example: 'CONS-01' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: "Dastlabki ko'rik" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: "Birinchi murojaat uchun ko'rik" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 80000, description: 'Price in UZS' })
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 30, description: 'Duration in minutes', default: 30 })
  @IsInt()
  @Min(1)
  @IsOptional()
  duration?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
