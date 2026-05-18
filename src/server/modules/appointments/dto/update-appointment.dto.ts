import { ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateAppointmentDto {
  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  @ApiPropertyOptional({ example: 'Gripp, ARVI' })
  @IsString()
  @IsOptional()
  diagnosis?: string;

  @ApiPropertyOptional({ example: 'Paracetamol 500mg x3' })
  @IsString()
  @IsOptional()
  prescription?: string;

  @ApiPropertyOptional({ example: 'Keyingi hafta qayta kelsin' })
  @IsString()
  @IsOptional()
  notes?: string;
}
