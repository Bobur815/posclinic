import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '../../generated/prisma-sqlite';
import type { ServiceKind } from '../../shared/clinic';
import { ADMIN_ROLES, checkOpenCase, type HandlerContext, RefusedError } from '../ipc/ipc-safe';
import { normalizePhone } from '../../shared/phone';
import { nextAppointmentNumber } from '../ipc/appointment-handlers';
import { recomputeCaseStatus } from './case-status';
import { getClinicSettings } from './clinic-settings';
import { type LineInput, PricingError, priceLines, sessionPlan } from './pricing';

/**
 * Reception registers services for a patient (`appointments:create`): one paid order inside the
 * patient's case. Prices, doctors, follow-up and discounts are decided here from the till's own
 * data (pricing.ts); the caller only names services, quantities and choices.
 *
 *   - no `caseId`: a new case is opened (a new visit for the plan limit, license-core.ts);
 *   - `caseId`: must be this patient's and not closed;
 *   - referral lines move the referral on (registered quantity, PARTIAL / REGISTERED);
 *   - procedure lines get one treatment session per unit, planned `perDay` a day;
 *   - an order that costs nothing (a free follow-up) is paid at once and goes to the queue.
 */

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export interface RegisterInput {
  patientId?: unknown;
  caseId?: unknown;
  appointmentDate?: unknown;
  notes?: unknown;
  /** Legacy payload (one doctor for the visit): used for consultation lines without one. */
  doctorId?: unknown;
  items?: unknown;
  /** An admin's phone + password when a receptionist gives more than the allowed discount. */
  approval?: { phone?: unknown; password?: unknown } | null;
}

const DAY = 24 * 60 * 60 * 1000;

function datePrefix(letter: string, now: Date): string {
  return `${letter}${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

/** Highest sequence used today + 1 (as nextAppointmentNumber), e.g. `C20261115-004`. */
export async function nextCaseNumber(tx: Pick<Tx, 'clinicalCase'>, now = new Date()) {
  const prefix = datePrefix('C', now);
  const rows = await tx.clinicalCase.findMany({
    where: { caseNumber: { startsWith: `${prefix}-` } },
    select: { caseNumber: true },
  });
  const max = rows.reduce((m, r) => {
    const n = parseInt(r.caseNumber.slice(prefix.length + 1), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Wrong admin approvals per signed-in user: after APPROVAL_FAILURES the user waits
 * APPROVAL_LOCK_MS (an admin password must not be guessable through the discount dialog).
 */
const APPROVAL_FAILURES = 5;
const APPROVAL_LOCK_MS = 10 * 60 * 1000;
const approvalFails = new Map<string, { count: number; until: number }>();

/** Tests only. */
export function resetApprovalThrottle(): void {
  approvalFails.clear();
}

/** Verifies an admin's phone + password for a big discount; throws on failure (throttled). */
async function verifyAdminApproval(
  db: PrismaClient,
  ctx: HandlerContext,
  approval: RegisterInput['approval'],
): Promise<void> {
  const key = ctx.actor?.id ?? 'anonymous';
  const now = Date.now();
  const f = approvalFails.get(key);
  if (f && f.until > now) throw new RefusedError('errors.tooManyAttempts');
  let ok = false;
  if (approval && typeof approval.password === 'string' && approval.password.length <= 128) {
    const phone = normalizePhone(typeof approval.phone === 'string' ? approval.phone : null);
    const admin = phone ? await db.user.findUnique({ where: { phone } }) : null;
    ok =
      !!admin &&
      admin.active &&
      ADMIN_ROLES.has(admin.role) &&
      (await bcrypt.compare(approval.password, admin.password));
  }
  if (ok) {
    approvalFails.delete(key);
    return;
  }
  const count = (f && f.until <= now && f.count >= APPROVAL_FAILURES ? 0 : (f?.count ?? 0)) + 1;
  approvalFails.set(key, { count, until: count >= APPROVAL_FAILURES ? now + APPROVAL_LOCK_MS : 0 });
  throw new RefusedError('errors.approvalFailed');
}

/** Registration is for now (a little clock skew allowed) or a future booking, never the past. */
const PAST_SLACK_MS = 10 * 60 * 1000;
const FUTURE_MAX_MS = 60 * DAY;

function lineInputs(input: RegisterInput): LineInput[] {
  const raw = Array.isArray(input.items) ? (input.items as Record<string, unknown>[]) : [];
  const legacyDoctor = typeof input.doctorId === 'string' ? input.doctorId : null;
  return raw.map((l) => ({
    serviceId: String(l?.serviceId ?? ''),
    quantity: Number(l?.quantity ?? 1),
    doctorId: typeof l?.doctorId === 'string' && l.doctorId ? l.doctorId : legacyDoctor,
    referralId: typeof l?.referralId === 'string' && l.referralId ? l.referralId : null,
    fullCourse: l?.fullCourse === true,
    discountPercent: l?.discountPercent === undefined ? 0 : Number(l.discountPercent),
  }));
}

/** Runs inside the caller's unique-number retry (two desks may take the same number). */
export async function registerOrder(
  db: PrismaClient,
  ctx: HandlerContext,
  input: RegisterInput,
  terminalId: string | null,
  options: { dryRun?: boolean } = {},
) {
  const lines = lineInputs(input);
  if (lines.length === 0 || lines.length > 50) throw new RefusedError('errors.noServices');
  const now = new Date();
  const appointmentDate =
    input.appointmentDate === undefined ? now : new Date(String(input.appointmentDate));
  if (
    Number.isNaN(appointmentDate.getTime()) ||
    appointmentDate.getTime() < now.getTime() - PAST_SLACK_MS ||
    appointmentDate.getTime() > now.getTime() + FUTURE_MAX_MS
  ) {
    throw new RefusedError('errors.invalidDate');
  }
  const patientId = typeof input.patientId === 'string' ? input.patientId : '';
  const caseId = typeof input.caseId === 'string' && input.caseId ? input.caseId : null;

  const settings = await getClinicSettings(db);
  const isAdmin = ADMIN_ROLES.has(ctx.actor?.role ?? '');
  // An approval is needed only above the receptionist's limit. A quote never checks the password
  // (it would tell the caller whether a guess was right); it prices as if approved and says so.
  // bcrypt is slow: verified before the transaction, not inside it.
  const needsAdminApproval =
    !isAdmin && lines.some((l) => (l.discountPercent ?? 0) > settings.maxDiscountPercent);
  // No approval sent: pricing refuses with errors.discountNeedsAdmin (the screen offers the
  // dialog). One sent: it is checked (throttled) before anything is written.
  if (needsAdminApproval && !options.dryRun && input.approval) {
    await verifyAdminApproval(db, ctx, input.approval);
  }
  const approved = isAdmin || (needsAdminApproval && !!input.approval);

  return db.$transaction(async (tx: Tx) => {
    const patient = await tx.patient.findUnique({ where: { id: patientId } });
    if (!patient || !patient.active) throw new RefusedError('errors.notFound');

    const existingCase = caseId
      ? await tx.clinicalCase.findFirst({
          where: { id: caseId, patientId, status: { not: 'CLOSED' } },
        })
      : null;
    if (caseId && !existingCase) throw new RefusedError('errors.caseUnavailable');

    const [services, referrals, doctors] = await Promise.all([
      tx.service.findMany({
        where: { id: { in: [...new Set(lines.map((l) => l.serviceId))] }, active: true },
      }),
      tx.referral.findMany({
        where: { patientId, status: { in: ['PENDING', 'PARTIAL'] } },
      }),
      tx.doctor.findMany({ where: { active: true }, select: { id: true } }),
    ]);

    let followUpIsFree = false;
    if (existingCase && settings.followUpFreeDays > 0) {
      // Measured from the till's own clock, never from a date the caller sends.
      const since = new Date(now.getTime() - settings.followUpFreeDays * DAY);
      followUpIsFree =
        (await tx.appointmentItem.count({
          where: {
            unitPrice: { gt: 0 },
            status: { not: 'CANCELLED' },
            service: { kind: 'CONSULTATION', isFollowUp: false },
            appointment: {
              caseId: existingCase.id,
              paymentStatus: 'PAID',
              appointmentDate: { gte: since, lte: now },
            },
          },
        })) > 0;
    }

    let priced: ReturnType<typeof priceLines>;
    try {
      priced = priceLines(lines, {
        services: new Map(
          services.map((s) => [
            s.id,
            {
              id: s.id,
              name: s.name,
              price: Number(s.price),
              kind: s.kind as ServiceKind,
              isFollowUp: s.isFollowUp,
            },
          ]),
        ),
        referrals: new Map(
          referrals
            .filter((r) => !existingCase || r.caseId === existingCase.id)
            .map((r) => [
              r.id,
              {
                id: r.id,
                serviceId: r.serviceId,
                quantity: r.quantity,
                registeredQty: r.registeredQty,
                perDay: r.perDay,
              },
            ]),
        ),
        doctors: new Set(doctors.map((d) => d.id)),
        followUpIsFree,
        maxDiscountPercent: settings.maxDiscountPercent,
        adminApproved: approved,
      });
    } catch (e) {
      if (e instanceof PricingError) throw new RefusedError(e.key);
      throw e;
    }

    if (options.dryRun) {
      // A quote for the registration screen: nothing above wrote anything.
      return {
        quote: true as const,
        lines: priced,
        totalAmount: Math.round(priced.reduce((s, p) => s + p.total, 0) * 100) / 100,
        discountAmount: Math.round(priced.reduce((s, p) => s + p.discount, 0) * 100) / 100,
        followUpIsFree,
        maxDiscountPercent: settings.maxDiscountPercent,
        /** Saving will ask for (and check) the admin's phone + password. */
        needsAdminApproval,
      };
    }

    // A referral belongs to a case: registering one without a case continues that case.
    const referralCaseId = priced
      .map((p) => referrals.find((r) => r.id === p.referralId)?.caseId)
      .find(Boolean);
    let theCase = existingCase;
    if (!theCase && referralCaseId) {
      theCase = await tx.clinicalCase.findFirst({
        where: { id: referralCaseId, status: { not: 'CLOSED' } },
      });
    }
    // The legacy one-doctor-per-visit payload keeps its doctor on the order.
    const legacyDoctor =
      typeof input.doctorId === 'string' && doctors.some((d) => d.id === input.doctorId)
        ? input.doctorId
        : null;
    const consultDoctor =
      priced.find((p) => p.kind === 'CONSULTATION')?.doctorId ?? legacyDoctor;
    if (!theCase) {
      // A new case is a new visit for the plan's monthly limit: asked here, where it happens.
      await checkOpenCase();
      theCase = await tx.clinicalCase.create({
        data: {
          id: randomUUID(),
          caseNumber: await nextCaseNumber(tx),
          patientId,
          doctorId: consultDoctor,
          status: 'OPEN',
        },
      });
    }

    const totalAmount = Math.round(priced.reduce((s, p) => s + p.total, 0) * 100) / 100;
    const discountAmount = Math.round(priced.reduce((s, p) => s + p.discount, 0) * 100) / 100;
    const free = totalAmount === 0;
    const day0 = new Date(appointmentDate);
    day0.setHours(0, 0, 0, 0);

    const appointment = await tx.appointment.create({
      data: {
        id: randomUUID(),
        appointmentNumber: await nextAppointmentNumber(tx),
        patientId,
        doctorId: consultDoctor,
        caseId: theCase.id,
        appointmentDate,
        notes: typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim() : null,
        totalAmount,
        discountAmount,
        // Nothing to pay (a free follow-up): paid now, so it reaches the doctor's queue.
        ...(free ? { paymentStatus: 'PAID', paidAmount: 0 } : {}),
        terminalId,
        items: {
          create: priced.map((p) => ({
            id: randomUUID(),
            serviceId: p.serviceId,
            serviceName: p.serviceName,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            discount: p.discount,
            total: p.total,
            doctorId: p.doctorId,
            referralId: p.referralId,
            ...(p.kind === 'PROCEDURE'
              ? {
                  sessions: {
                    create: sessionPlan(p.quantity, p.perDay).map((offset, i) => ({
                      id: randomUUID(),
                      number: i + 1,
                      plannedDate: new Date(day0.getTime() + offset * DAY),
                    })),
                  },
                }
              : {}),
          })),
        },
      },
      include: { items: true, patient: true, doctor: true },
    });

    for (const p of priced) {
      if (!p.referralId) continue;
      const r = referrals.find((x) => x.id === p.referralId);
      if (!r) continue;
      const registeredQty = r.registeredQty + p.quantity;
      await tx.referral.update({
        where: { id: r.id },
        data: { registeredQty, status: registeredQty >= r.quantity ? 'REGISTERED' : 'PARTIAL' },
      });
    }

    if (!theCase.doctorId && consultDoctor) {
      await tx.clinicalCase.update({
        where: { id: theCase.id },
        data: { doctorId: consultDoctor },
      });
    }
    await recomputeCaseStatus(tx, theCase.id);

    return appointment;
  });
}
