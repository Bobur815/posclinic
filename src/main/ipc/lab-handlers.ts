import { randomUUID } from 'node:crypto';
import { completeOrderIfDone, recomputeCaseStatus, touchOrder } from '../clinic/case-status';
import { settleItemStock } from '../clinic/stock';
import { getPrismaClient } from '../database/sqlite-client';
import { ADMIN_ROLES, type HandlerContext, handle, ipcSafe, RefusedError } from './ipc-safe';

/**
 * Lab and procedures (v2.5, P4): paid analyses wait for a sample and a result; paid courses
 * have sessions to tick off. Any signed-in staff may do this work (most clinics have two tills,
 * reception and the doctor's); the doctor confirms a result on the case page.
 */

const PAID = { paymentStatus: { in: ['PAID', 'PARTIAL'] } };
const DAY = 24 * 60 * 60 * 1000;

function actorOf(ctx: HandlerContext) {
  if (!ctx.actor) throw new RefusedError('errors.notAuthenticated');
  return ctx.actor;
}

const PATIENT = {
  select: {
    id: true,
    patientCode: true,
    fullName: true,
    phone: true,
    birthDate: true,
    gender: true,
  },
} as const;

async function paidAnalysisLine(itemId: unknown) {
  const db = getPrismaClient();
  const item = await db.appointmentItem.findUnique({
    where: { id: String(itemId ?? '') },
    include: {
      service: true,
      appointment: { select: { id: true, caseId: true, patientId: true, paymentStatus: true } },
      results: true,
    },
  });
  if (!item) throw new RefusedError('errors.notFound');
  if (item.service.kind !== 'ANALYSIS') throw new RefusedError('errors.notAnAnalysis');
  if (!['PAID', 'PARTIAL'].includes(item.appointment.paymentStatus)) {
    throw new RefusedError('errors.notPaid');
  }
  if (item.status === 'CANCELLED') throw new RefusedError('errors.alreadyDone');
  return item;
}

export function setupLabHandlers(): void {
  /**
   * The lab / procedure board: paid analyses not done yet (with their sample state), and course
   * sessions planned up to today and not ticked (overdue ones first).
   */
  handle('queue:listLab', async (ctx) => {
    actorOf(ctx);
    const db = getPrismaClient();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const [analyses, sessions] = await Promise.all([
      db.appointmentItem.findMany({
        where: {
          status: { in: ['WAITING', 'IN_PROGRESS'] },
          service: { kind: 'ANALYSIS' },
          appointment: PAID,
        },
        include: {
          service: {
            select: {
              id: true,
              name: true,
              kind: true,
              resultType: true,
              resultUnit: true,
              referenceRange: true,
            },
          },
          results: true,
          appointment: {
            select: {
              id: true,
              appointmentNumber: true,
              createdAt: true,
              caseId: true,
              patient: PATIENT,
            },
          },
        },
        orderBy: { appointment: { createdAt: 'asc' } },
      }),
      db.treatmentSession.findMany({
        where: {
          doneAt: null,
          plannedDate: { lte: endOfToday },
          item: { status: { not: 'CANCELLED' }, appointment: PAID },
        },
        include: {
          item: {
            select: {
              id: true,
              serviceName: true,
              quantity: true,
              appointment: { select: { id: true, caseId: true, patient: PATIENT } },
              _count: { select: { sessions: { where: { doneAt: { not: null } } } } },
            },
          },
        },
        orderBy: [{ plannedDate: 'asc' }, { number: 'asc' }],
      }),
    ]);
    return ipcSafe({ analyses, sessions });
  });

  /**
   * For the doctor's queue page: their cases with results entered and not yet confirmed (the
   * patient may come back with them without a new consultation).
   */
  handle('queue:listResultsReady', async (ctx) => {
    const a = actorOf(ctx);
    const db = getPrismaClient();
    const me = await db.doctor.findUnique({ where: { userId: a.id }, select: { id: true } });
    if (!me && !ADMIN_ROLES.has(a.role)) return [];
    const cases = await db.clinicalCase.findMany({
      where: { status: 'RESULT_READY', ...(me ? { doctorId: me.id } : {}) },
      include: {
        patient: PATIENT,
        analysisResults: {
          where: { enteredAt: { not: null }, confirmedAt: null },
          select: { id: true, enteredAt: true, service: { select: { name: true } } },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });
    return ipcSafe(cases);
  });

  /** The sample is taken: the analysis is in progress (its result row is created). */
  handle('results:sampleTaken', async (ctx, itemId: unknown) => {
    const a = actorOf(ctx);
    const item = await paidAnalysisLine(itemId);
    if (item.status === 'DONE') throw new RefusedError('errors.alreadyDone');
    const db = getPrismaClient();
    const now = new Date();
    const result = await db.$transaction(async (tx) => {
      const existing = item.results[0];
      const r = existing
        ? await tx.analysisResult.update({
            where: { id: existing.id },
            data: { sampleTakenAt: existing.sampleTakenAt ?? now },
          })
        : await tx.analysisResult.create({
            data: {
              id: randomUUID(),
              itemId: item.id,
              caseId: item.appointment.caseId,
              patientId: item.appointment.patientId,
              serviceId: item.serviceId,
              unit: item.service.resultUnit,
              sampleTakenAt: now,
            },
          });
      await tx.appointmentItem.update({
        where: { id: item.id },
        data: { status: 'IN_PROGRESS', startedAt: item.startedAt ?? now, performedBy: a.id },
      });
      await touchOrder(tx, item.appointment.id);
      if (item.appointment.caseId) await recomputeCaseStatus(tx, item.appointment.caseId);
      return r;
    });
    return ipcSafe(result);
  });

  /**
   * Enter the result, shaped by the service's result type: POSITIVE / NEGATIVE, a number, or
   * text. The line is done; the case shows "result ready" until the doctor confirms it.
   */
  handle('results:save', async (ctx, itemId: unknown, data: Record<string, unknown>) => {
    const a = actorOf(ctx);
    const item = await paidAnalysisLine(itemId);
    const existing = item.results[0];
    if (existing?.confirmedAt) throw new RefusedError('errors.resultConfirmed');
    const text = (v: unknown, max: number) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
    const type = item.service.resultType ?? 'QUALITATIVE';
    let outcome: string | null = null;
    let value: number | null = null;
    if (type === 'QUALITATIVE') {
      if (data?.outcome !== 'POSITIVE' && data?.outcome !== 'NEGATIVE') {
        throw new RefusedError('errors.invalidResult');
      }
      outcome = data.outcome;
    } else if (type === 'QUANTITATIVE') {
      value = Number(data?.value);
      if (
        data?.value === '' ||
        data?.value == null ||
        !Number.isFinite(value) ||
        Math.abs(value) > 1e9
      ) {
        throw new RefusedError('errors.invalidResult');
      }
    }
    const finding = text(data?.finding, 200);
    const comment = text(data?.comment, 2000);
    if (type === 'TEXT' && !finding && !comment) throw new RefusedError('errors.invalidResult');

    const db = getPrismaClient();
    const now = new Date();
    const result = await db.$transaction(async (tx) => {
      const fields = {
        outcome,
        value,
        unit: item.service.resultUnit,
        finding,
        comment,
        enteredBy: a.id,
        enteredAt: now,
      };
      const r = existing
        ? await tx.analysisResult.update({ where: { id: existing.id }, data: fields })
        : await tx.analysisResult.create({
            data: {
              id: randomUUID(),
              itemId: item.id,
              caseId: item.appointment.caseId,
              patientId: item.appointment.patientId,
              serviceId: item.serviceId,
              sampleTakenAt: now,
              ...fields,
            },
          });
      await tx.appointmentItem.update({
        where: { id: item.id },
        data: {
          status: 'DONE',
          startedAt: item.startedAt ?? now,
          completedAt: now,
          performedBy: a.id,
        },
      });
      // v2.10: the analysis uses its supplies (test kit, tubes…) once it is done.
      await settleItemStock(tx, item.id, a.id);
      await completeOrderIfDone(tx, item.appointment.id);
      await touchOrder(tx, item.appointment.id);
      if (item.appointment.caseId) await recomputeCaseStatus(tx, item.appointment.caseId);
      return r;
    });
    return ipcSafe(result);
  });

  /**
   * The doctor confirms a result (it joins the patient's history as final). The case's doctor,
   * a doctor with a consultation in the case, or an admin.
   */
  handle('results:confirm', async (ctx, resultId: unknown) => {
    const a = actorOf(ctx);
    const db = getPrismaClient();
    const r = await db.analysisResult.findUnique({
      where: { id: String(resultId ?? '') },
      include: { case: { select: { id: true, doctorId: true } } },
    });
    if (!r) throw new RefusedError('errors.notFound');
    if (!r.enteredAt) throw new RefusedError('errors.invalidResult');
    if (r.confirmedAt) throw new RefusedError('errors.resultConfirmed');
    if (!ADMIN_ROLES.has(a.role)) {
      if (a.role !== 'DOCTOR') throw new RefusedError('errors.forbidden');
      const me = await db.doctor.findUnique({ where: { userId: a.id }, select: { id: true } });
      if (!me) throw new RefusedError('errors.noDoctorProfile');
      const mine =
        r.case?.doctorId === me.id ||
        (r.caseId &&
          (await db.appointmentItem.count({
            where: { doctorId: me.id, appointment: { caseId: r.caseId } },
          })) > 0);
      if (!mine) throw new RefusedError('errors.notYourPatient');
    }
    const confirmed = await db.$transaction(async (tx) => {
      const u = await tx.analysisResult.update({
        where: { id: r.id },
        data: { confirmedAt: new Date(), confirmedBy: a.id },
      });
      if (r.caseId) await recomputeCaseStatus(tx, r.caseId);
      return u;
    });
    return ipcSafe(confirmed);
  });

  /**
   * Tick a course session as done ("3 of 10"); the last one finishes the line. `undo` un-ticks a
   * session ticked today (a mistake at the desk), never an older one.
   */
  handle('sessions:tick', async (ctx, sessionId: unknown, undo?: unknown) => {
    const a = actorOf(ctx);
    const db = getPrismaClient();
    const s = await db.treatmentSession.findUnique({
      where: { id: String(sessionId ?? '') },
      include: {
        item: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            appointment: { select: { id: true, caseId: true, paymentStatus: true } },
          },
        },
      },
    });
    if (!s) throw new RefusedError('errors.notFound');
    if (!['PAID', 'PARTIAL'].includes(s.item.appointment.paymentStatus)) {
      throw new RefusedError('errors.notPaid');
    }
    if (s.item.status === 'CANCELLED') throw new RefusedError('errors.alreadyDone');
    const now = new Date();
    if (undo === true) {
      if (!s.doneAt || now.getTime() - s.doneAt.getTime() > DAY) {
        throw new RefusedError('errors.cannotUndo');
      }
    } else if (s.doneAt) {
      throw new RefusedError('errors.alreadyDone');
    }
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.treatmentSession.update({
        where: { id: s.id },
        data: undo === true ? { doneAt: null, doneBy: null } : { doneAt: now, doneBy: a.id },
      });
      const left = await tx.treatmentSession.count({ where: { itemId: s.item.id, doneAt: null } });
      await tx.appointmentItem.update({
        where: { id: s.item.id },
        data:
          left === 0
            ? {
                status: 'DONE',
                startedAt: s.item.startedAt ?? now,
                completedAt: now,
                performedBy: a.id,
              }
            : { status: 'IN_PROGRESS', startedAt: s.item.startedAt ?? now, completedAt: null },
      });
      // v2.10: a ticked session uses the procedure's supplies; an undo gives them back.
      await settleItemStock(tx, s.item.id, a.id);
      if (left === 0) await completeOrderIfDone(tx, s.item.appointment.id);
      else {
        // An undo can reopen a completed order.
        await tx.appointment.updateMany({
          where: { id: s.item.appointment.id, status: 'COMPLETED' },
          data: { status: 'SCHEDULED' },
        });
      }
      await touchOrder(tx, s.item.appointment.id);
      if (s.item.appointment.caseId) await recomputeCaseStatus(tx, s.item.appointment.caseId);
      return u;
    });
    return ipcSafe(updated);
  });
}
