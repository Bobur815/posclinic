import type { KeyObject } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  checkLicense,
  DEFAULT_LICENSE_PUBLIC_KEY,
  type LicenseCheck,
  publicKeyFrom,
  type ServerLicensePayload,
} from './license-verify';

const clip = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null;

@Injectable()
export class LicenseService {
  private readonly logger = new Logger(LicenseService.name);
  private readonly key: KeyObject;

  constructor(private readonly prisma: PrismaService) {
    this.key = publicKeyFrom(
      process.env.POSCLINIC_LICENSE_PUBLIC_KEY?.trim() || DEFAULT_LICENSE_PUBLIC_KEY,
    );
  }

  check(token: unknown, now = Date.now()): LicenseCheck {
    return checkLicense(token, this.key, now);
  }

  /**
   * Create or rename the clinic from the verified licence, copy plan/expiry/block, and record the
   * calling terminal. Runs on every authenticated sync call.
   */
  async touch(
    license: ServerLicensePayload,
    terminalIdRaw: unknown,
    appVersionRaw: unknown,
    now = new Date(),
  ): Promise<void> {
    const clinic = {
      name: license.storeName,
      plan: license.plan,
      expiresAt: license.expiresAt ? new Date(license.expiresAt) : null,
      blockAt: license.blockAt ? new Date(license.blockAt) : null,
      lastSyncAt: now,
    };
    const terminalId = clip(terminalIdRaw, 100) ?? 'unknown';
    const appVersion = clip(appVersionRaw, 40);
    await this.prisma.clinic.upsert({
      where: { id: license.storeId },
      create: { id: license.storeId, ...clinic },
      update: clinic,
    });
    await this.prisma.terminalHeartbeat.upsert({
      where: { clinicId_terminalId: { clinicId: license.storeId, terminalId } },
      create: { clinicId: license.storeId, terminalId, lastSyncAt: now, appVersion },
      update: { lastSyncAt: now, appVersion },
    });
    this.logger.debug(`sync call clinic=${license.storeId} terminal=${terminalId}`);
  }
}
