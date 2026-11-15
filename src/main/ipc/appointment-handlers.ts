import { handle, ipcSafe, RefusedError } from './ipc-safe';
import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { log } from '../logger';
import { type RegisterInput, registerOrder } from '../clinic/register-order';

type Db = ReturnType<typeof getPrismaClient>;
type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

/** `A20261115-007`: today's prefix and the next number after the highest one used today. */
export async function nextAppointmentNumber(
  db: Pick<Tx, 'appointment'>,
  now = new Date(),
): Promise<string> {
  const prefix = `A${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  // The highest sequence, not the newest row: two desks may create in the same millisecond, and
  // `-1000` sorts below `-999` as text.
  const rows = await db.appointment.findMany({
    where: { appointmentNumber: { startsWith: `${prefix}-` } },
    select: { appointmentNumber: true },
  });
  const max = rows.reduce((m: number, r: { appointmentNumber: string }) => {
    const n = parseInt(r.appointmentNumber.slice(prefix.length + 1), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/** Prisma's unique-constraint failure. */
export function isUniqueConflict(error: unknown, fields: string[]): boolean {
  const e = error as { code?: string; meta?: { target?: unknown }; message?: string };
  if (e?.code !== 'P2002') return false;
  const target = e.meta?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? e.message ?? '');
  return fields.some((f) => text.includes(f));
}

/**
 * Two desks (the main till and a satellite, or two satellites) may take the same number at the
 * same moment. The number is read and used inside one transaction, and a unique conflict on it
 * (the other desk won) simply tries again with the next one.
 */
export async function withUniqueRetry<T>(
  fields: string[],
  run: () => Promise<T>,
  attempts = 5,
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await run();
    } catch (error) {
      if (i >= attempts || !isUniqueConflict(error, fields)) throw error;
    }
  }
}

export function setupAppointmentHandlers(): void {
  handle('appointments:create', async (ctx, data: RegisterInput) => {
    try {
      const appointment = await withUniqueRetry(
        ['appointment_number', 'appointmentNumber', 'case_number', 'caseNumber'],
        () => registerOrder(getPrismaClient(), ctx, data ?? {}, ctx.terminalId || getAppConfig().terminalId),
      );
      return ipcSafe(appointment);
    } catch (error) {
      log.error('[appointments:create]', error);
      throw error;
    }
  });

  handle(
    'appointments:getAll',
    async (
      _event,
      filters?: {
        status?: string;
        startDate?: string;
        endDate?: string;
        today?: boolean;
        /** One calendar day, `YYYY-MM-DD` (Daily report). */
        date?: string;
      },
    ) => {
      try {
        const prisma = getPrismaClient();
        const where: Record<string, unknown> = {};

        if (filters?.status) where.status = filters.status;
        const day = filters?.today
          ? new Date()
          : filters?.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)
            ? new Date(`${filters.date}T00:00:00`)
            : null;
        if (day) {
          const start = new Date(day);
          start.setHours(0, 0, 0, 0);
          const end = new Date(day);
          end.setHours(23, 59, 59, 999);
          where.appointmentDate = { gte: start, lte: end };
        } else if (filters?.startDate || filters?.endDate) {
          where.appointmentDate = {};
          if (filters.startDate)
            (where.appointmentDate as Record<string, unknown>).gte = new Date(filters.startDate);
          if (filters.endDate)
            (where.appointmentDate as Record<string, unknown>).lte = new Date(filters.endDate);
        }

        const appointments = await prisma.appointment.findMany({
          where,
          include: { patient: true, doctor: true, items: true },
          orderBy: { appointmentDate: 'desc' },
        });

        return ipcSafe(appointments);
      } catch (error) {
        log.error('[appointments:getAll]', error);
        throw error;
      }
    },
  );

  handle('appointments:getById', async (_event, id: string) => {
    try {
      const prisma = getPrismaClient();
      const appointment = await prisma.appointment.findUnique({
        where: { id },
        include: { patient: true, doctor: true, items: { include: { service: true } } },
      });
      return ipcSafe(appointment);
    } catch (error) {
      log.error('[appointments:getById]', error);
      throw error;
    }
  });

  handle('appointments:update', async (_event, id: string, data: Record<string, unknown>) => {
    try {
      const prisma = getPrismaClient();
      const appointment = await prisma.appointment.update({
        where: { id },
        data: {
          status: data.status as string | undefined,
          diagnosis: data.diagnosis as string | null | undefined,
          prescription: data.prescription as string | null | undefined,
          notes: data.notes as string | null | undefined,
        },
        include: { patient: true, doctor: true, items: true },
      });
      return ipcSafe(appointment);
    } catch (error) {
      log.error('[appointments:update]', error);
      throw error;
    }
  });

  handle('appointments:getTodaySummary', async () => {
    try {
      const prisma = getPrismaClient();
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const today = { appointmentDate: { gte: start, lte: end } };
      const [total, completed, pending, paid, appointments] = await Promise.all([
        prisma.appointment.count({ where: today }),
        prisma.appointment.count({ where: { ...today, status: 'COMPLETED' } }),
        // Still owed: not cancelled and not fully paid.
        prisma.appointment.count({
          where: { ...today, status: { not: 'CANCELLED' }, paymentStatus: { not: 'PAID' } },
        }),
        // Money taken today, partial payments included.
        prisma.appointment.findMany({
          where: { ...today, paidAmount: { gt: 0 } },
          select: { paidAmount: true },
        }),
        prisma.appointment.findMany({
          where: today,
          include: { patient: true, doctor: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

      const revenue = paid.reduce(
        (sum: number, a: { paidAmount: unknown }) => sum + Number(a.paidAmount),
        0,
      );

      return ipcSafe({
        total,
        completed,
        revenue,
        pending,
        recentAppointments: appointments,
      });
    } catch (error) {
      log.error('[appointments:getTodaySummary]', error);
      throw error;
    }
  });

  handle(
    'appointments:checkout',
    async (
      _event,
      id: string,
      data: {
        paymentMethod: string;
        /** Money taken now; more than what is owed is change, not credit. */
        amount: number;
      },
    ) => {
      try {
        const amount = Number(data?.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw new RefusedError('errors.invalidAmount');
        const prisma = getPrismaClient();

        // Read and write in one transaction: two desks paying the same visit cannot both
        // add onto the same old balance.
        const updated = await prisma.$transaction(async (tx) => {
          const appointment = await tx.appointment.findUnique({
            where: { id },
            select: { totalAmount: true, paidAmount: true, status: true },
          });
          if (!appointment) throw new RefusedError('errors.notFound');
          if (appointment.status === 'CANCELLED') throw new RefusedError('errors.visitCancelled');

          const totalAmount = Number(appointment.totalAmount);
          const alreadyPaid = Number(appointment.paidAmount);
          if (alreadyPaid >= totalAmount) throw new RefusedError('errors.alreadyPaid');

          const paidAmount = Math.min(totalAmount, alreadyPaid + amount);
          const paymentStatus = paidAmount >= totalAmount ? 'PAID' : 'PARTIAL';

          return tx.appointment.update({
            where: { id },
            data: {
              // Paying puts the lines in the doctor's / nurse's queue; the visit is completed
              // when its lines are done (queue handlers), not by the payment.
              paymentStatus,
              paymentMethod: data.paymentMethod,
              paidAmount,
            },
            include: { patient: true, doctor: true, items: true },
          });
        });

        return ipcSafe(updated);
      } catch (error) {
        log.error('[appointments:checkout]', error);
        throw error;
      }
    },
  );
}
