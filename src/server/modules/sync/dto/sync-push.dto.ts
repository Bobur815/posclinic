import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SyncItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() serviceId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() serviceName!: string;
  @ApiProperty() @IsNumber() quantity!: number;
  @ApiProperty() @IsNumber() unitPrice!: number;
  @ApiProperty() @IsNumber() total!: number;
}

export class SyncAppointmentDto {
  @ApiProperty() @IsString() @IsNotEmpty() id!: string;
  @ApiProperty() @IsString() @IsNotEmpty() appointmentNumber!: string;
  @ApiProperty() @IsString() @IsNotEmpty() patientId!: string;
  @ApiProperty() @IsString() @IsNotEmpty() doctorId!: string;
  @ApiProperty() @IsDateString() appointmentDate!: string;
  @ApiProperty() @IsString() status!: string;
  @ApiProperty() @IsString() paymentStatus!: string;
  @ApiPropertyOptional() @IsString() @IsOptional() paymentMethod?: string | null;
  @ApiProperty() @IsNumber() totalAmount!: number;
  @ApiProperty() @IsNumber() paidAmount!: number;
  @ApiPropertyOptional() @IsString() @IsOptional() diagnosis?: string | null;
  @ApiPropertyOptional() @IsString() @IsOptional() prescription?: string | null;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string | null;

  @ApiProperty({ type: [SyncItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncItemDto)
  items!: SyncItemDto[];
}

export class SyncPushDto {
  @ApiProperty({ type: [SyncAppointmentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncAppointmentDto)
  appointments!: SyncAppointmentDto[];
}
