import { getClinicSettings, setClinicSettings } from '../clinic/clinic-settings';
import { registerOrder, type RegisterInput } from '../clinic/register-order';
import { getAppConfig } from '../config/app-config';
import { getPrismaClient } from '../database/sqlite-client';
import { handle, ipcSafe, RefusedError, requireAdmin, requireReception } from './ipc-safe';

/**
 * Reception reads for the registration flow (v2.5): a price quote, the patient's open cases with
 * the doctor's referrals waiting to be registered, and the clinic workflow settings.
 */

const DAY = 24 * 60 * 60 * 1000;

export function setupClinicHandlers(): void {
  /** What `appointments:create` would charge for this input; writes nothing. */
  handle('appointments:quote', async (ctx, data: RegisterInput) => {
    requireReception(ctx);
    return ipcSafe(
      await registerOrder(
        getPrismaClient(),
        ctx,
        data ?? {},
        ctx.terminalId || getAppConfig().terminalId,
        { dryRun: true },
      ),
    );
  });

  /**
   * Open cases of a patient, newest first, each with its referrals still to register and until
   * when a follow-up consultation is free.
   */
  handle('cases:forPatient', async (_ctx, patientId: unknown) => {
    if (typeof patientId !== 'string' || !patientId) throw new RefusedError('errors.notFound');
    const db = getPrismaClient();
    const settings = await getClinicSettings(db);
    const cases = await db.clinicalCase.findMany({
      where: { patientId, status: { not: 'CLOSED' } },
      orderBy: { openedAt: 'desc' },
      include: {
        doctor: { select: { id: true, fullName: true } },
        referrals: {
          where: { status: { in: ['PENDING', 'PARTIAL'] } },
          orderBy: { createdAt: 'asc' },
          include: {
            service: { select: { id: true, name: true, kind: true, price: true, active: true } },
            doctor: { select: { id: true, fullName: true } },
          },
        },
      },
    });
    const out = [];
    for (const c of cases) {
      const lastPaidConsult = await db.appointmentItem.findFirst({
        where: {
          unitPrice: { gt: 0 },
          status: { not: 'CANCELLED' },
          service: { kind: 'CONSULTATION', isFollowUp: false },
          appointment: { caseId: c.id, paymentStatus: 'PAID' },
        },
        orderBy: { appointment: { appointmentDate: 'desc' } },
        select: { appointment: { select: { appointmentDate: true } } },
      });
      const until =
        lastPaidConsult && settings.followUpFreeDays > 0
          ? new Date(
              lastPaidConsult.appointment.appointmentDate.getTime() +
                settings.followUpFreeDays * DAY,
            )
          : null;
      out.push({
        ...c,
        followUpFreeUntil: until && until.getTime() > Date.now() ? until : null,
        referrals: c.referrals.map((r) => ({ ...r, remaining: r.quantity - r.registeredQty })),
      });
    }
    return ipcSafe(out);
  });

  handle('clinic:getSettings', async () => getClinicSettings(getPrismaClient()));

  handle('clinic:setSettings', async (ctx, patch: Record<string, unknown>) => {
    requireAdmin(ctx);
    try {
      return await setClinicSettings(getPrismaClient(), patch ?? {});
    } catch (e) {
      if ((e as Error).message === 'errors.invalidSetting') {
        throw new RefusedError('errors.invalidSetting');
      }
      throw e;
    }
  });
}
