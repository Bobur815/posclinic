import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { type LicensedRequest, LicenseGuard } from '../license/license.guard';
import { SyncPullQueryDto, SyncPushDto } from './dto/sync.dto';
import { SyncService } from './sync.service';

@ApiTags('sync')
@ApiSecurity('License')
@ApiHeader({ name: 'X-Terminal-Id', required: false })
@ApiHeader({ name: 'X-App-Version', required: false })
@UseGuards(LicenseGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @HttpCode(200)
  @ApiOperation({ summary: 'Main till pushes changed rows (last write wins, idempotent)' })
  push(@Req() req: LicensedRequest, @Body() body: SyncPushDto) {
    return this.sync.push(req.clinicId as string, body);
  }

  @Get('pull')
  @ApiOperation({ summary: 'Doctors, services and users changed on the server since a cursor' })
  pull(@Req() req: LicensedRequest, @Query() query: SyncPullQueryDto) {
    return this.sync.pull(req.clinicId as string, query.since);
  }
}
