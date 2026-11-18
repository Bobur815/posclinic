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
      case 'cases':
        return this.tx.clinicalCase.findMany({ where, select: ref });
      case 'referrals':
        return this.tx.referral.findMany({ where, select: ref });
      case 'vitals':
        return this.tx.patientVitals.findMany({ where, select: ref });
      case 'results':
        return this.tx.analysisResult.findMany({ where, select: ref });
      case 'serviceTypes':
        return this.tx.serviceType.findMany({ where, select: ref });
      case 'staffTypes':
        return this.tx.staffType.findMany({ where, select: ref });
      case 'products':
        return this.tx.product.findMany({ where, select: ref });
      case 'stockReceipts':
        return this.tx.stockReceipt.findMany({ where, select: ref });
      case 'stockMovements':
        return this.tx.stockMovement.findMany({ where, select: ref });
      case 'expenses':
        return this.tx.expense.findMany({ where, select: ref });
      case 'payments':
        return this.tx.payment.findMany({ where, select: ref });
      default:
        return [];
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
        // Items (and their course sessions, by cascade) are replaced as a set with their
        // appointment.
        await this.tx.appointmentItem.deleteMany({ where: { appointmentId: id } });
        if (items.length > 0) {
          await this.tx.appointmentItem.createMany({
            data: items.map(({ sessions: _s, ...i }) => ({ ...i, appointmentId: id })),
          });
          const sessions = items.flatMap((i) => i.sessions.map((s) => ({ ...s, itemId: i.id })));
          if (sessions.length > 0) await this.tx.treatmentSession.createMany({ data: sessions });
        }
        return;
      }
      case 'cases': {
        const { id, ...data } = row as RowMap['cases'];
        await this.tx.clinicalCase.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      case 'referrals': {
        const { id, ...data } = row as RowMap['referrals'];
        await this.tx.referral.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      case 'vitals': {
        const { id, ...data } = row as RowMap['vitals'];
        await this.tx.patientVitals.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      case 'results': {
        const { id, ...data } = row as RowMap['results'];
        await this.tx.analysisResult.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      case 'serviceTypes': {
        const { id, ...data } = row as RowMap['serviceTypes'];
        await this.tx.serviceType.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      case 'staffTypes': {
        const { id, ...data } = row as RowMap['staffTypes'];
        await this.tx.staffType.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      // v2.10: stock and money (read-only on the web).
      case 'products': {
        const { id, ...data } = row as RowMap['products'];
        await this.tx.product.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      case 'stockReceipts': {
        const { id, ...data } = row as RowMap['stockReceipts'];
        await this.tx.stockReceipt.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      case 'stockMovements': {
        const { id, ...data } = row as RowMap['stockMovements'];
        await this.tx.stockMovement.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      case 'expenses': {
        const { id, ...data } = row as RowMap['expenses'];
        await this.tx.expense.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
      case 'payments': {
        const { id, ...data } = row as RowMap['payments'];
        await this.tx.payment.upsert({
          where: { id },
          create: { id, clinicId, ...data, syncedAt },
          update: { ...data, syncedAt },
        });
        return;
      }
    }
  }
}
