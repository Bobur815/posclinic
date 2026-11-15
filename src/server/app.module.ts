import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SyncModule } from './modules/sync/sync.module';
import { PrismaModule } from './prisma/prisma.module';

/**
 * posclinic cloud server: the main till syncs here (licence auth), clinic admins use the web
 * dashboard (JWT). Contract: `.claude/rules/server-api.md`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    SyncModule,
    CatalogModule,
    ReportsModule,
  ],
})
export class AppModule {}
