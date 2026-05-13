import { Controller, Get, Post, Put, Body, Param, Request, UseGuards } from '@nestjs/common';
import { DoctorsService } from './doctors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('doctors')
export class DoctorsController {
  constructor(private doctorsService: DoctorsService) {}

  @Get()
  findAll(@Request() req: { user: { clinicId: string } }) {
    return this.doctorsService.findAll(req.user.clinicId);
  }

  @Get('active')
  findActive(@Request() req: { user: { clinicId: string } }) {
    return this.doctorsService.findActive(req.user.clinicId);
  }

  @Post()
  create(
    @Request() req: { user: { clinicId: string } },
    @Body() body: { fullName: string; specialty?: string; phone?: string; isActive?: boolean },
  ) {
    return this.doctorsService.create(req.user.clinicId, body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.doctorsService.update(id, body as Parameters<DoctorsService['update']>[1]);
  }
}
