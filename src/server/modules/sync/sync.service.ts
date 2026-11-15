import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { errorKey } from '../../common/errors';
import { doctorOut, serviceOut, userSyncOut } from '../../common/serialize';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaSyncDb } from './prisma-sync-db';
import { applyPush, batchError, type PushBody } from './sync-apply';

/**
 * A pull cursor is moved back by this much: a write that committed just after the pull read
 * its rows but stamped `syncedAt` just before `serverTime` would otherwise be skipped forever.
 * Rows seen twice are harmless (the till applies them last-write-wins).
 */
export const PULL_OVERLAP_MS = 5_000;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async push(clinicId: string, body: PushBody) {
    const bad = batchError(body);
    if (bad) throw new BadRequestException(errorKey('batch_too_large'));
    const now = new Date();
    const result = await this.prisma.$transaction(
      (tx) => applyPush(new PrismaSyncDb(tx), clinicId, body, now),
      { timeout: 60_000, maxWait: 10_000 },
    );
    this.logger.log(
      `push clinic=${clinicId} written=${result.written} rejected=${result.rejected.length}`,
    );
    return { accepted: result.accepted, rejected: result.rejected, serverTime: now.toISOString() };
  }

  async pull(clinicId: string, since?: string) {
    const serverTime = new Date(Date.now() - PULL_OVERLAP_MS);
    const after = since ? new Date(since) : new Date(0);
    const where = { clinicId, syncedAt: { gt: after } };
    const orderBy = { syncedAt: 'asc' } as const;
    const [doctors, services, users] = await Promise.all([
      this.prisma.doctor.findMany({ where, orderBy }),
      this.prisma.service.findMany({ where, orderBy }),
      this.prisma.user.findMany({ where, orderBy }),
    ]);
    return {
      doctors: doctors.map(doctorOut),
      services: services.map(serviceOut),
      users: users.map(userSyncOut),
      serverTime: serverTime.toISOString(),
    };
  }
}
