import { Controller, Get, Post, Put, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(private servicesService: ServicesService) {}

  @Get()
  findAll(@Request() req: { user: { clinicId: string } }, @Query('q') q?: string) {
    if (q) return this.servicesService.search(req.user.clinicId, q);
    return this.servicesService.findAll(req.user.clinicId);
  }

  @Get('active')
  findActive(@Request() req: { user: { clinicId: string } }) {
    return this.servicesService.findActive(req.user.clinicId);
  }

  @Post()
  create(
    @Request() req: { user: { clinicId: string } },
    @Body() body: { code: string; name: string; price: number; duration?: number; isActive?: boolean },
  ) {
    return this.servicesService.create(req.user.clinicId, body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.servicesService.update(id, body as Parameters<ServicesService['update']>[1]);
  }
}
