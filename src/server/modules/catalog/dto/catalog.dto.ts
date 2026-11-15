import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TILL_ROLES } from '../../../common/roles';

// ── Services ──
export class CreateServiceDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) code!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) name!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  description?: string | null;
  @ApiProperty({ description: 'UZS' }) @IsNumber() @Min(0) @Max(1e12) price!: number;
  @ApiPropertyOptional({ default: 30 }) @IsOptional() @IsInt() @Min(0) @Max(1440) duration?: number;
  @ApiPropertyOptional({ enum: ['CONSULTATION', 'ANALYSIS', 'PROCEDURE'] })
  @IsOptional()
  @IsIn(['CONSULTATION', 'ANALYSIS', 'PROCEDURE'])
  kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFollowUp?: boolean;
  @ApiPropertyOptional({ enum: ['QUALITATIVE', 'QUANTITATIVE', 'TEXT'], nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(['QUALITATIVE', 'QUANTITATIVE', 'TEXT'])
  resultType?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(100)
  resultUnit?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(100)
  referenceRange?: string | null;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateServiceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(100) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(500) name?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(1e12) price?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1440) duration?: number;
  @ApiPropertyOptional({ enum: ['CONSULTATION', 'ANALYSIS', 'PROCEDURE'] })
  @IsOptional()
  @IsIn(['CONSULTATION', 'ANALYSIS', 'PROCEDURE'])
  kind?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFollowUp?: boolean;
  @ApiPropertyOptional({ enum: ['QUALITATIVE', 'QUANTITATIVE', 'TEXT'], nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(['QUALITATIVE', 'QUANTITATIVE', 'TEXT'])
  resultType?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(100)
  resultUnit?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(100)
  referenceRange?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ── Doctors ──
export class CreateDoctorDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) fullName!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(40)
  phone?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(200)
  specialty?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(100)
  licenseNo?: string | null;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateDoctorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(500) fullName?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(40)
  phone?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(200)
  specialty?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(100)
  licenseNo?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ── Users (staff) ──
export class CreateUserDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) fullName!: string;
  @ApiProperty({ example: '+998901234567' }) @IsString() @MaxLength(40) phone!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsEmail()
  @MaxLength(200)
  email?: string | null;
  @ApiProperty({ enum: TILL_ROLES }) @IsIn(TILL_ROLES as unknown as string[]) role!: string;
  @ApiProperty({ minLength: 6 }) @IsString() @MinLength(6) @MaxLength(200) password!: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(500) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsEmail()
  @MaxLength(200)
  email?: string | null;
  @ApiPropertyOptional({ enum: TILL_ROLES })
  @IsOptional()
  @IsIn(TILL_ROLES as unknown as string[])
  role?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 6 }) @IsString() @MinLength(6) @MaxLength(200) newPassword!: string;
}
