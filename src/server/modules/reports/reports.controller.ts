import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';

@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard/summary')
  @ApiTags('dashboard')
  @ApiOperation({ summary: 'One clinic day (Asia/Tashkent). revenue = money received' })
  @ApiQuery({ name: 'date', required: false, example: '2026-11-15' })
  summary(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.reports.summary(user.clinicId, date);
  }

  @Get('reports/daily')
  @ApiTags('reports')
  @ApiOperation({ summary: 'Daily report. totals.revenue = billed, paid = received' })
  @ApiQuery({ name: 'date', required: false, example: '2026-11-15' })
  daily(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.reports.daily(user.clinicId, date);
  }

  @Get('reports/monthly')
  @ApiTags('reports')
  @ApiOperation({ summary: 'Monthly report with byDay' })
  @ApiQuery({ name: 'month', required: false, example: '2026-11' })
  monthly(@CurrentUser() user: AuthUser, @Query('month') month?: string) {
    return this.reports.monthly(user.clinicId, month);
  }
}
