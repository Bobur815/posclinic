import { Controller, Get, Post, Body, Query, Request, UseGuards } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Get('pull')
  pull(
    @Request() req: { user: { clinicId: string } },
    @Query('since') since?: string,
  ) {
    return this.syncService.pullData(req.user.clinicId, since);
  }

  @Post('push')
  push(
    @Request() req: { user: { clinicId: string } },
    @Body() body: { appointments: Parameters<SyncService['pushAppointments']>[1] },
  ) {
    return this.syncService.pushAppointments(req.user.clinicId, body.appointments || []);
  }
}
