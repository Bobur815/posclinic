import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AppointmentItemDto {
  @ApiProperty({ example: 'svc-001' })
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @ApiProperty({ example: "Dastlabki ko'rik" })
  @IsString()
  @IsNotEmpty()
  serviceName!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 80000 })
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreateAppointmentDto {
  @ApiProperty({ example: 'pat-001' })
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty({ example: 'doctor-001' })
  @IsString()
  @IsNotEmpty()
  doctorId!: string;

  @ApiProperty({ example: '2026-05-14T09:00:00.000Z' })
  @IsDateString()
  appointmentDate!: string;

  @ApiPropertyOptional({ example: "Bosh aylanishi, ko'ngil aynishi" })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [AppointmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AppointmentItemDto)
  items!: AppointmentItemDto[];
}
