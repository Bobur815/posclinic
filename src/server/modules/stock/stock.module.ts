import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

/** Stock, expenses and the money report on the web dashboard (read-only, till v2.10). */
@Module({
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
