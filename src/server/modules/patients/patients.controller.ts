import { Controller, Get, Post, Put, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Gender } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('patients')
export class PatientsController {
  constructor(private patientsService: PatientsService) {}

  @Get()
  findAll(@Request() req: { user: { clinicId: string } }, @Query('q') q?: string) {
    return this.patientsService.findAll(req.user.clinicId, q);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.patientsService.findById(id);
  }

  @Post()
  create(
    @Request() req: { user: { clinicId: string } },
    @Body() body: {
      fullName: string;
      phone: string;
      birthDate?: string;
      gender?: Gender;
      bloodType?: string;
      allergies?: string;
      address?: string;
      city?: string;
      notes?: string;
    },
  ) {
    return this.patientsService.create(req.user.clinicId, body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.patientsService.update(id, body as Parameters<PatientsService['update']>[1]);
  }
}
