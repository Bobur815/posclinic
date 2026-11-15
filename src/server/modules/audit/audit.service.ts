import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { paging } from '../../common/dates';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../auth/auth-user';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** One row per web mutation. `details` must hold ids / field names only, never patient data. */
  async record(
    actor: AuthUser,
    action: string,
    entity: string,
    entityId: string,
    details?: Record<string, unknown>,
    db: Db = this.prisma,
  ): Promise<void> {
    await db.auditLog.create({
      data: {
        clinicId: actor.clinicId,
        userId: actor.id,
        action,
        entity,
        entityId,
        details: details ? JSON.stringify(details) : null,
      },
    });
  }

  async list(clinicId: string, page?: number, pageSize?: number) {
    const { skip, take } = paging(page, pageSize);
    const where = { clinicId };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.auditLog.count({ where }),
    ]);
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = await this.prisma.user.findMany({
      where: { clinicId, id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    const names = new Map(users.map((u) => [u.id, u.fullName]));
    return {
      items: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: names.get(r.userId) ?? null,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        details: r.details ? (JSON.parse(r.details) as unknown) : null,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
    };
  }
}
