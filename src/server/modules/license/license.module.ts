import { Module } from '@nestjs/common';
import { LicenseGuard } from './license.guard';
import { LicenseService } from './license.service';

@Module({
  providers: [LicenseService, LicenseGuard],
  exports: [LicenseService, LicenseGuard],
})
export class LicenseModule {}
