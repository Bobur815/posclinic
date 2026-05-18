import { Body, Controller, Get, Param, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  AppointmentCreateResponse,
  AppointmentDetailResult,
  AppointmentListResponse,
  AppointmentMutationResponse,
  TodaySummaryResponse,
} from '../../common/interfaces';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import { AppointmentsService } from './appointments.service';
import type { CheckoutDto } from './dto/checkout.dto';
import type { CreateAppointmentDto } from './dto/create-appointment.dto';
import type { UpdateAppointmentDto } from './dto/update-appointment.dto';

interface ClinicRequest {
  user: { tenantId: string; clinicId: string };
}

@ApiTags('appointments')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private appointmentsService: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List appointments with optional filters' })
  @ApiQuery({ name: 'today', required: false, type: Boolean, description: 'Filter to today only' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'date', required: false, description: 'Filter by date (YYYY-MM-DD)' })
  findAll(
    @Request() req: ClinicRequest,
    @Query('today') today?: string,
    @Query('status') status?: string,
    @Query('date') date?: string,
  ): Promise<AppointmentListResponse> {
    return this.appointmentsService.findAll(req.user.clinicId, {
      today: today === 'true',
      status,
      date,
    });
  }

  @Get('summary/today')
  @ApiOperation({ summary: "Get today's appointment summary (total, completed, pending, revenue)" })
  getTodaySummary(@Request() req: ClinicRequest): Promise<TodaySummaryResponse> {
    return this.appointmentsService.getTodaySummary(req.user.clinicId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment with patient, doctor, and items' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  findById(@Param('id') id: string): Promise<AppointmentDetailResult> {
    return this.appointmentsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new appointment with service items' })
  @ApiResponse({ status: 201, description: 'Appointment created' })
  create(
    @Request() req: ClinicRequest,
    @Body() dto: CreateAppointmentDto,
  ): Promise<AppointmentCreateResponse> {
    return this.appointmentsService.create(req.user.clinicId, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update appointment status, diagnosis, or prescription' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ): Promise<AppointmentMutationResponse> {
    return this.appointmentsService.update(id, dto);
  }

  @Post(':id/checkout')
  @ApiOperation({ summary: 'Process payment for an appointment' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  checkout(
    @Param('id') id: string,
    @Body() dto: CheckoutDto,
  ): Promise<AppointmentMutationResponse> {
    return this.appointmentsService.checkout(id, dto);
  }
}
