import { Controller, Get, Post, Put, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AppointmentStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private appointmentsService: AppointmentsService) {}

  @Get()
  findAll(
    @Request() req: { user: { clinicId: string } },
    @Query('today') today?: string,
    @Query('status') status?: string,
    @Query('date') date?: string,
  ) {
    return this.appointmentsService.findAll(req.user.clinicId, {
      today: today === 'true',
      status,
      date,
    });
  }

  @Get('summary/today')
  getTodaySummary(@Request() req: { user: { clinicId: string } }) {
    return this.appointmentsService.getTodaySummary(req.user.clinicId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.appointmentsService.findById(id);
  }

  @Post()
  create(
    @Request() req: { user: { clinicId: string } },
    @Body() body: {
      patientId: string;
      doctorId: string;
      appointmentDate: string;
      notes?: string;
      items: Array<{ serviceId: string; serviceName: string; quantity: number; unitPrice: number }>;
    },
  ) {
    return this.appointmentsService.create(req.user.clinicId, body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: Partial<{ status: AppointmentStatus; diagnosis: string; prescription: string; notes: string }>,
  ) {
    return this.appointmentsService.update(id, body);
  }

  @Post(':id/checkout')
  checkout(
    @Param('id') id: string,
    @Body() body: { paymentMethod: string; amount: number },
  ) {
    return this.appointmentsService.checkout(id, body);
  }
}
