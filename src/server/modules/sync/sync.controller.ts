import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { SyncPullResponse, SyncPushResponse } from '../../common/interfaces';
import { JwtAuthGuard } from '../auth/jwt/jwt-auth.guard';
import type { SyncPushDto } from './dto/sync-push.dto';
import { SyncService } from './sync.service';

interface ClinicRequest {
  user: { tenantId: string; clinicId: string };
}

@ApiTags('sync')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Get('pull')
  @ApiOperation({ summary: 'Pull updated patients, doctors, and services since last sync' })
  @ApiQuery({ name: 'since', required: false, description: 'ISO timestamp of last sync' })
  @ApiResponse({ status: 200, description: 'Returns patients, doctors, services, and syncTime' })
  pull(@Request() req: ClinicRequest, @Query('since') since?: string): Promise<SyncPullResponse> {
    return this.syncService.pullData(req.user.clinicId, since);
  }

  @Post('push')
  @ApiOperation({ summary: 'Push locally-created appointments from POS terminal to VPS' })
  @ApiResponse({ status: 200, description: 'Returns count of synced appointments' })
  push(@Request() req: ClinicRequest, @Body() dto: SyncPushDto): Promise<SyncPushResponse> {
    return this.syncService.pushAppointments(req.user.clinicId, dto.appointments);
  }
}
