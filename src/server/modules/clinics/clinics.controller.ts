import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ClinicsService } from './clinics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicType } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('clinics')
export class ClinicsController {
  constructor(private clinicsService: ClinicsService) {}

  @Get()
  findAll() {
    return this.clinicsService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.clinicsService.findById(id);
  }

  @Post()
  create(@Body() body: { name: string; phone?: string; address?: string; type?: ClinicType }) {
    return this.clinicsService.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<{ name: string; phone: string; address: string; active: boolean }>) {
    return this.clinicsService.update(id, body);
  }
}
