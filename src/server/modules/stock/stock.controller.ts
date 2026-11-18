import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StockService } from './stock.service';

/** Read-only stock, expenses and money report (till v2.10). Days are clinic time (UTC+5). */
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller()
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('stock/products')
  @ApiTags('stock')
  @ApiOperation({ summary: 'Products with on hand and average cost' })
  @ApiQuery({ name: 'includeInactive', required: false, example: 'false' })
  products(@CurrentUser() user: AuthUser, @Query('includeInactive') includeInactive?: string) {
    return this.stock.products(user.clinicId, includeInactive === 'true');
  }

  @Get('stock/movements')
  @ApiTags('stock')
  @ApiOperation({ summary: 'Stock movements in a period (optionally of one product)' })
  movements(
    @CurrentUser() user: AuthUser,
    @Query('productId') productId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.stock.movements(user.clinicId, { productId, from, to, page, pageSize });
  }

  @Get('expenses')
  @ApiTags('stock')
  @ApiOperation({ summary: 'Expenses in a period (voided ones too, with voidedAt)' })
  expenses(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.stock.expenses(user.clinicId, { from, to, page, pageSize });
  }

  @Get('reports/finance')
  @ApiTags('reports')
  @ApiOperation({ summary: 'Money report: income, costs, expenses, profit, cash out, stock' })
  @ApiQuery({ name: 'from', required: false, example: '2026-11-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-11-30' })
  finance(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.stock.finance(user.clinicId, from, to);
  }
}
