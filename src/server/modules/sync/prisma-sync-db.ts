import type { Prisma } from '@prisma/client';
import type { AppointmentIn, RowMap, StoredRef, SyncDb, SyncEntity } from './sync-apply';

type Tx = Prisma.TransactionClient;

const ref = { id: true, clinicId: true, updatedAt: true } as const;

/** `SyncDb` over a Prisma transaction client. */
export class PrismaSyncDb implements SyncDb {
  constructor(private readonly tx: Tx) {}

  async find(entity: SyncEntity, ids: string[]): Promise<StoredRef[]> {
    if (ids.length === 0) return [];
    const where = { id: { in: ids } };
    switch (entity) {
      case 'users':
        return this.tx.user.findMany({ where, select: ref });
      case 'doctors':
        return this.tx.doctor.findMany({ where, select: ref });
      case 'services':
        return this.tx.service.findMany({ where, select: ref });
      case 'patients':
        return this.tx.patient.findMany({ where, select: ref });
      case 'appointments':
        return this.tx.appointment.findMany({ where, select: ref });
    }
  }

  async userIdByPhone(clinicId: string, phone: string): Promise<string | null> {
    const u = await this.tx.user.findUnique({
      where: { clinicId_phone: { clinicId, phone } },
      select: { id: true },
    });
    return u?.id ?? null;
  }

  async serviceIdByCode(clinicId: string, code: string): Promise<string | null> {
    const s = await this.tx.service.findUnique({
      where: { clinicId_code: { clinicId, code } },
      select: { id: true },
    });
    return s?.id ?? null;
  }

  async write<E extends SyncEntity>(
    entity: E,
    clinicId: string,
    row: RowMap[E],
    syncedAt: Date,
  ): Promise<void> {
    switch (entity) {
      case 'users': {
        const { id, ...data } = row as RowMap['users'];
        await this.tx.user.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      case 'doctors': {
        const { id, ...data } = row as RowMap['doctors'];
        await this.tx.doctor.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      case 'services': {
        const { id, ...data } = row as RowMap['services'];
        await this.tx.service.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      case 'patients': {
        const { id, ...data } = row as RowMap['patients'];
        await this.tx.patient.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      case 'appointments': {
        const { id, items, ...data } = row as AppointmentIn;
        await this.tx.appointment.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        // Items are replaced as a set with their appointment.
        await this.tx.appointmentItem.deleteMany({ where: { appointmentId: id } });
        if (items.length > 0) {
          await this.tx.appointmentItem.createMany({
            data: items.map((i) => ({ ...i, appointmentId: id })),
          });
        }
        return;
      }
    }
  }
}
