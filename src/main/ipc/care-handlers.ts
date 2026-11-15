import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { normalizePhone } from '../../shared/phone';
import { completeOrderIfDone, recomputeCaseStatus } from '../clinic/case-status';
import { getPrismaClient } from '../database/sqlite-client';
import { isUniqueConflict } from './appointment-handlers';
import {
  ADMIN_ROLES,
  type HandlerContext,
  handle,
  ipcSafe,
  RefusedError,
  requireAdmin,
} from './ipc-safe';

/**
 * The doctor's side of the workflow (v2.5, P3): the doctor's queue and reception's overview of
 * who waits for whom, the case page, per-visit vitals, referrals back to reception, and the
 * doctor's own login. Roles are enforced here; the renderer only hides controls.
 */

type Db = ReturnType<typeof getPrismaClient>;

/** Lines that reached a queue: the order is paid (or partly, with the `debt` feature). */
const PAID = { paymentStatus: { in: ['PAID', 'PARTIAL'] } };
const OPEN_LINE = { in: ['WAITING', 'IN_PROGRESS'] };

function actorOf(ctx: HandlerContext) {
  if (!ctx.actor) throw new RefusedError('errors.notAuthenticated');
  return ctx.actor;
}
const isAdminRole = (role: string) => ADMIN_ROLES.has(role);

/** The doctor record linked to the signed-in user, or null. */
async function myDoctorId(db: Db, ctx: HandlerContext): Promise<string | null> {
  const a = actorOf(ctx);
  const d = await db.doctor.findUnique({ where: { userId: a.id }, select: { id: true } });
  return d?.id ?? null;
}

/** Doctors (and admins) write clinical decisions: diagnosis, referrals, closing a case. */
async function requireClinician(db: Db, ctx: HandlerContext): Promise<string | null> {
  const a = actorOf(ctx);
  if (isAdminRole(a.role)) return myDoctorId(db, ctx);
  if (a.role !== 'DOCTOR') throw new RefusedError('errors.forbidden');
  const id = await myDoctorId(db, ctx);
  if (!id) throw new RefusedError('errors.noDoctorProfile');
  return id;
}

const num = (v: unknown, min: number, max: number): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new RefusedError('errors.invalidVitals');
  return n;
};
const text = (v: unknown, max = 2000): string | null | undefined => {
  if (v === undefined) return undefined;
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
};

const QUEUE_INCLUDE = {
  service: { select: { id: true, name: true, kind: true } },
  doctor: { select: { id: true, fullName: true } },
  appointment: {
    select: {
      id: true,
      appointmentNumber: true,
      appointmentDate: true,
      createdAt: true,
      caseId: true,
      patient: {
        select: {
          id: true,
          patientCode: true,
          fullName: true,
          phone: true,
          birthDate: true,
          gender: true,
        },
      },
      case: { select: { id: true, caseNumber: true, status: true } },
    },
  },
} as const;

export function setupCareHandlers(): void {
  /** The signed-in doctor's paid consultations still to see, oldest first. */
  handle('queue:listMine', async (ctx) => {
    const db = getPrismaClient();
    const doctorId = await myDoctorId(db, ctx);
    if (!doctorId) return [];
    const items = await db.appointmentItem.findMany({
      where: {
        doctorId,
        status: OPEN_LINE,
        service: { kind: 'CONSULTATION' },
        appointment: PAID,
      },
      include: QUEUE_INCLUDE,
      orderBy: { appointment: { createdAt: 'asc' } },
    });
    return ipcSafe(items);
  });

  /** Reception's board: every paid line still waiting or in progress, any queue. */
  handle('queue:listOverview', async (ctx) => {
    actorOf(ctx);
    const items = await getPrismaClient().appointmentItem.findMany({
      where: { status: OPEN_LINE, appointment: PAID },
      include: QUEUE_INCLUDE,
      orderBy: { appointment: { createdAt: 'asc' } },
    });
    return ipcSafe(items);
  });

  /**
   * Take a consultation (IN_PROGRESS) or finish it (DONE). Only the line's own doctor or an
   * admin; an unpaid line never reaches a queue. Analysis and procedure lines move through the
   * lab / procedure queue (results and sessions), not here.
   */
  for (const [channel, next] of [
    ['queue:start', 'IN_PROGRESS'],
    ['queue:finish', 'DONE'],
  ] as const) {
    handle(channel, async (ctx, itemId: unknown) => {
      const a = actorOf(ctx);
      const db = getPrismaClient();
      const item = await db.appointmentItem.findUnique({
        where: { id: String(itemId ?? '') },
        include: {
          service: { select: { kind: true } },
          appointment: { select: { id: true, caseId: true, paymentStatus: true } },
        },
      });
      if (!item) throw new RefusedError('errors.notFound');
      if (item.service.kind !== 'CONSULTATION') throw new RefusedError('errors.useLabQueue');
      if (!['PAID', 'PARTIAL'].includes(item.appointment.paymentStatus)) {
        throw new RefusedError('errors.notPaid');
      }
      if (!isAdminRole(a.role)) {
        const mine = await myDoctorId(db, ctx);
        if (!mine || mine !== item.doctorId) throw new RefusedError('errors.forbidden');
      }
      if (item.status === 'DONE' || item.status === 'CANCELLED') {
        throw new RefusedError('errors.alreadyDone');
      }
      const now = new Date();
      const updated = await db.$transaction(async (tx) => {
        const u = await tx.appointmentItem.update({
          where: { id: item.id },
          data:
            next === 'IN_PROGRESS'
              ? { status: next, startedAt: item.startedAt ?? now, performedBy: a.id }
              : {
                  status: next,
                  startedAt: item.startedAt ?? now,
                  completedAt: now,
                  performedBy: a.id,
                },
        });
        if (next === 'DONE') await completeOrderIfDone(tx, item.appointment.id);
        if (item.appointment.caseId) await recomputeCaseStatus(tx, item.appointment.caseId);
        return u;
      });
      return ipcSafe(updated);
    });
  }

  /** The case page: the patient, every order and line, vitals, referrals and results. */
  handle('cases:get', async (ctx, caseId: unknown) => {
    actorOf(ctx);
    const db = getPrismaClient();
    const c = await db.clinicalCase.findUnique({
      where: { id: String(caseId ?? '') },
      include: {
        patient: true,
        doctor: { select: { id: true, fullName: true } },
        appointments: {
          orderBy: { appointmentDate: 'asc' },
          include: {
            items: {
              include: {
                service: { select: { id: true, name: true, kind: true, resultType: true } },
                doctor: { select: { id: true, fullName: true } },
                sessions: { orderBy: { number: 'asc' } },
              },
            },
          },
        },
        referrals: {
          orderBy: { createdAt: 'asc' },
          include: { service: { select: { id: true, name: true, kind: true } } },
        },
        vitals: { orderBy: { recordedAt: 'desc' } },
        analysisResults: {
          orderBy: { createdAt: 'asc' },
          include: { service: { select: { id: true, name: true, resultType: true } } },
        },
      },
    });
    if (!c) throw new RefusedError('errors.notFound');
    const [latestVitals, otherCases] = await Promise.all([
      db.patientVitals.findFirst({
        where: { patientId: c.patientId },
        orderBy: { recordedAt: 'desc' },
      }),
      db.clinicalCase.findMany({
        where: { patientId: c.patientId, id: { not: c.id } },
        orderBy: { openedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          caseNumber: true,
          status: true,
          openedAt: true,
          closedAt: true,
          diagnosis: true,
        },
      }),
    ]);
    return ipcSafe({ ...c, latestVitals, otherCases });
  });

  /** Complaint / diagnosis, close or reopen: the doctor (or an admin). */
  handle('cases:update', async (ctx, caseId: unknown, data: Record<string, unknown>) => {
    const db = getPrismaClient();
    await requireClinician(db, ctx);
    const id = String(caseId ?? '');
    const c = await db.clinicalCase.findUnique({ where: { id } });
    if (!c) throw new RefusedError('errors.notFound');
    const updated = await db.$transaction(async (tx) => {
      await tx.clinicalCase.update({
        where: { id },
        data: {
          complaint: text(data?.complaint),
          diagnosis: text(data?.diagnosis),
          ...(data?.close === true ? { status: 'CLOSED', closedAt: new Date() } : {}),
          ...(data?.reopen === true && c.status === 'CLOSED'
            ? { status: 'OPEN', closedAt: null }
            : {}),
        },
      });
      if (data?.close !== true) await recomputeCaseStatus(tx, id);
      return tx.clinicalCase.findUnique({ where: { id } });
    });
    return ipcSafe(updated);
  });

  /** Height, weight, temperature, pressure… for this visit (any staff: reception or doctor). */
  handle('cases:recordVitals', async (ctx, data: Record<string, unknown>) => {
    const a = actorOf(ctx);
    const db = getPrismaClient();
    const patientId = String(data?.patientId ?? '');
    if (!(await db.patient.findUnique({ where: { id: patientId }, select: { id: true } }))) {
      throw new RefusedError('errors.notFound');
    }
    const caseId = typeof data?.caseId === 'string' && data.caseId ? data.caseId : null;
    if (caseId) {
      const c = await db.clinicalCase.findFirst({ where: { id: caseId, patientId } });
      if (!c) throw new RefusedError('errors.caseUnavailable');
    }
    const v = {
      heightCm: num(data?.heightCm, 30, 250),
      weightKg: num(data?.weightKg, 1, 400),
      temperature: num(data?.temperature, 30, 45),
      bpSystolic: num(data?.bpSystolic, 40, 300),
      bpDiastolic: num(data?.bpDiastolic, 20, 200),
    };
    const pregnant = data?.pregnant === true ? true : data?.pregnant === false ? false : null;
    const complaints = text(data?.complaints) ?? null;
    if (Object.values(v).every((x) => x == null) && pregnant === null && !complaints) {
      throw new RefusedError('errors.invalidVitals');
    }
    const row = await db.patientVitals.create({
      data: {
        id: randomUUID(),
        patientId,
        caseId,
        heightCm: v.heightCm ?? null,
        weightKg: v.weightKg ?? null,
        temperature: v.temperature ?? null,
        bpSystolic: v.bpSystolic == null ? null : Math.round(v.bpSystolic),
        bpDiastolic: v.bpDiastolic == null ? null : Math.round(v.bpDiastolic),
        pregnant,
        complaints,
        recordedBy: a.id,
      },
    });
    return ipcSafe(row);
  });

  /**
   * The doctor sends the patient to an analysis or prescribes a course; it waits at reception
   * (cases:forPatient) until registered and paid. `perDay` × `days` makes a course.
   */
  handle('cases:addReferral', async (ctx, caseId: unknown, data: Record<string, unknown>) => {
    const db = getPrismaClient();
    const myDoctor = await requireClinician(db, ctx);
    const c = await db.clinicalCase.findUnique({ where: { id: String(caseId ?? '') } });
    if (!c || c.status === 'CLOSED') throw new RefusedError('errors.caseUnavailable');
    const service = await db.service.findFirst({
      where: { id: String(data?.serviceId ?? ''), active: true },
    });
    if (!service) throw new RefusedError('errors.serviceUnavailable');
    if (service.kind === 'CONSULTATION') throw new RefusedError('errors.referralKind');
    const perDay = data?.perDay == null || data.perDay === '' ? null : Number(data.perDay);
    const days = data?.days == null || data.days === '' ? null : Number(data.days);
    const course = perDay !== null && days !== null;
    if (
      (perDay !== null && (!Number.isInteger(perDay) || perDay < 1 || perDay > 10)) ||
      (days !== null && (!Number.isInteger(days) || days < 1 || days > 365))
    ) {
      throw new RefusedError('errors.invalidQuantity');
    }
    const quantity = course ? (perDay as number) * (days as number) : Number(data?.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      throw new RefusedError('errors.invalidQuantity');
    }
    const referral = await db.$transaction(async (tx) => {
      const r = await tx.referral.create({
        data: {
          id: randomUUID(),
          caseId: c.id,
          patientId: c.patientId,
          doctorId: myDoctor ?? c.doctorId,
          serviceId: service.id,
          quantity,
          perDay: course ? perDay : null,
          days: course ? days : null,
          instructions: text(data?.instructions, 500) ?? null,
        },
      });
      await recomputeCaseStatus(tx, c.id);
      return r;
    });
    return ipcSafe(referral);
  });

  /** Withdraw a referral (what is already registered stays). */
  handle('cases:cancelReferral', async (ctx, referralId: unknown) => {
    const db = getPrismaClient();
    await requireClinician(db, ctx);
    const r = await db.referral.findUnique({ where: { id: String(referralId ?? '') } });
    if (!r) throw new RefusedError('errors.notFound');
    if (!['PENDING', 'PARTIAL'].includes(r.status)) throw new RefusedError('errors.alreadyDone');
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.referral.update({ where: { id: r.id }, data: { status: 'CANCELLED' } });
      await recomputeCaseStatus(tx, r.caseId);
      return u;
    });
    return ipcSafe(updated);
  });

  /**
   * The admin gives a doctor a till login (role DOCTOR, phone + password); the plan's staff
   * limit is checked by the licence gate first.
   */
  handle('doctors:createLogin', async (ctx, doctorId: unknown, data: Record<string, unknown>) => {
    requireAdmin(ctx);
    const db = getPrismaClient();
    const doctor = await db.doctor.findUnique({ where: { id: String(doctorId ?? '') } });
    if (!doctor) throw new RefusedError('errors.notFound');
    if (doctor.userId) throw new RefusedError('errors.loginExists');
    const phone = normalizePhone(typeof data?.phone === 'string' ? data.phone : null);
    if (!phone) throw new RefusedError('errors.invalidPhone');
    const password = typeof data?.password === 'string' ? data.password : '';
    if (password.length < 6) throw new RefusedError('errors.passwordTooShort');
    const hash = await bcrypt.hash(password, 10);
    const linked = await db
      .$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id: randomUUID(),
            phone,
            password: hash,
            role: 'DOCTOR',
            fullName: doctor.fullName,
          },
        });
        return tx.doctor.update({
          where: { id: doctor.id },
          data: { userId: user.id },
          include: { user: { select: { phone: true, active: true } } },
        });
      })
      .catch((e) => {
        if (isUniqueConflict(e, ['phone'])) throw new RefusedError('errors.phoneTaken');
        throw e;
      });
    return ipcSafe(linked);
  });
}
