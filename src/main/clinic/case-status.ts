import type { PrismaClient } from '../../generated/prisma-sqlite';
import type { CaseStatus } from '../../shared/clinic';

type Db = Pick<
  PrismaClient,
  | 'clinicalCase'
  | 'appointmentItem'
  | 'appointment'
  | 'referral'
  | 'analysisResult'
  | 'treatmentSession'
>;

/**
 * Where a case stands, derived from its records (never set by hand except CLOSED), in the order
 * the patient meets them:
 *
 *   WAITING_DOCTOR    a consultation line not done yet
 *   RESULT_READY      an analysis result entered but not confirmed by the doctor
 *   WAITING_ANALYSIS  an analysis line not done, or an analysis referral not registered
 *   ON_TREATMENT      course sessions left, or a procedure referral not registered
 *   OPEN              nothing pending (the doctor may close it)
 */
export async function recomputeCaseStatus(db: Db, caseId: string): Promise<CaseStatus> {
  const c = await db.clinicalCase.findUnique({ where: { id: caseId }, select: { status: true } });
  if (!c) return 'OPEN';
  if (c.status === 'CLOSED') return 'CLOSED';

  const open = { status: { in: ['WAITING', 'IN_PROGRESS'] }, appointment: { caseId } };
  const pendingReferral = (kind: string) =>
    db.referral.count({
      where: { caseId, status: { in: ['PENDING', 'PARTIAL'] }, service: { kind } },
    });

  let status: CaseStatus = 'OPEN';
  if (await db.appointmentItem.count({ where: { ...open, service: { kind: 'CONSULTATION' } } })) {
    status = 'WAITING_DOCTOR';
  } else if (
    await db.analysisResult.count({
      where: { caseId, enteredAt: { not: null }, confirmedAt: null },
    })
  ) {
    status = 'RESULT_READY';
  } else if (
    (await db.appointmentItem.count({ where: { ...open, service: { kind: 'ANALYSIS' } } })) ||
    (await pendingReferral('ANALYSIS'))
  ) {
    status = 'WAITING_ANALYSIS';
  } else if (
    (await db.treatmentSession.count({
      where: { doneAt: null, item: { status: { not: 'CANCELLED' }, appointment: { caseId } } },
    })) ||
    (await pendingReferral('PROCEDURE'))
  ) {
    status = 'ON_TREATMENT';
  }
  await db.clinicalCase.update({ where: { id: caseId }, data: { status } });
  return status;
}

/**
 * Lines and course sessions sync inside their order, and sync picks rows by the order's
 * `updatedAt`: any change to them must touch the order, or the server never hears of it.
 */
export async function touchOrder(db: Db, appointmentId: string): Promise<void> {
  await db.appointment.update({ where: { id: appointmentId }, data: { updatedAt: new Date() } });
}

/** An order is completed once none of its lines is waiting or in progress. */
export async function completeOrderIfDone(db: Db, appointmentId: string): Promise<void> {
  const left = await db.appointmentItem.count({
    where: { appointmentId, status: { in: ['WAITING', 'IN_PROGRESS'] } },
  });
  if (left === 0) {
    await db.appointment.updateMany({
      where: { id: appointmentId, status: { not: 'CANCELLED' } },
      data: { status: 'COMPLETED' },
    });
  }
}
