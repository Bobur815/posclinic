import type { PrismaClient } from '../../generated/prisma-sqlite';
import { buildFinanceReport, type FinanceReportDto } from '../../shared/stock';
import { RefusedError } from '../ipc/ipc-safe';
import { amountOf } from './shifts';
import { drawer, expenseCategoryOf, paidFromOf } from './stock';

/**
 * Expenses and the money report (v2.10). An expense paid from the drawer is a PAY_OUT of the
 * open shift in the same transaction, so the drawer count still adds up; voiding it puts the
 * money back (PAY_IN). Rows are never deleted.
 */

type Db = PrismaClient;
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const text = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

/** A row id the page made, so a repeated submit (double click, a satellite retry) is a no-op. */
export function clientIdOf(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : null;
}

/**
 * Cash from the drawer leaves now (a PAY_OUT of the open shift), so its expense is dated now.
 * Only an admin dates an expense paid outside the drawer (rent paid by bank last week), and
 * never in the future.
 */
export async function createExpense(
  tx: Tx,
  actorId: string,
  input: Record<string, unknown>,
  opts: { mayDate: boolean },
) {
  const id = clientIdOf(input?.id);
  if (id) {
    const done = await tx.expense.findUnique({ where: { id } });
    if (done) return done;
  }
  const category = expenseCategoryOf(input?.category);
  const amount = amountOf(input?.amount);
  const paidFrom = paidFromOf(input?.paidFrom);
  const note = text(input?.note, 500);
  let spentAt = new Date();
  if (opts.mayDate && paidFrom === 'OUTSIDE' && input?.spentAt != null && input.spentAt !== '') {
    spentAt = new Date(String(input.spentAt));
    if (Number.isNaN(spentAt.getTime()) || spentAt.getTime() > Date.now() + 60_000) {
      throw new RefusedError('errors.invalidInput');
    }
  }
  const cash =
    paidFrom === 'DRAWER'
      ? await drawer(tx, 'PAY_OUT', amount, `Xarajat: ${note || category}`, actorId)
      : null;
  return tx.expense.create({
    data: {
      ...(id ? { id } : {}),
      category,
      amount,
      paidFrom,
      note,
      spentAt,
      cashMovementId: cash?.id ?? null,
      createdById: actorId,
    },
  });
}

export async function voidExpense(tx: Tx, actorId: string, id: string) {
  const e = await tx.expense.findUnique({ where: { id } });
  if (!e) throw new RefusedError('errors.notFound');
  if (e.voidedAt) throw new RefusedError('errors.alreadyVoided');
  if (e.cashMovementId) {
    await drawer(tx, 'PAY_IN', Number(e.amount), `Bekor: xarajat ${e.category}`, actorId);
  }
  return tx.expense.update({
    where: { id },
    data: { voidedAt: new Date(), voidedById: actorId },
  });
}

/** Longest period one list or report covers (the server's limit too). */
const MAX_PERIOD_DAYS = 366;

/** Local calendar days `YYYY-MM-DD`, both included, as [from, to). */
export function periodOf(fromDay: unknown, toDay: unknown): { from: Date; to: Date } {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof fromDay !== 'string' || typeof toDay !== 'string') {
    throw new RefusedError('errors.invalidInput');
  }
  if (!day.test(fromDay) || !day.test(toDay)) throw new RefusedError('errors.invalidInput');
  const from = new Date(`${fromDay}T00:00:00`);
  const to = new Date(`${toDay}T00:00:00`);
  to.setDate(to.getDate() + 1);
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    to <= from ||
    to.getTime() - from.getTime() > MAX_PERIOD_DAYS * 86_400_000 + 3_600_000 // + a DST hour
  ) {
    throw new RefusedError('errors.invalidInput');
  }
  return { from, to };
}

export async function financeReport(db: Db, from: Date, to: Date): Promise<FinanceReportDto> {
  const range = { gte: from, lt: to };
  const [payments, visits, movements, expenses, receipts, products] = await Promise.all([
    db.payment.findMany({ where: { createdAt: range }, select: { method: true, amount: true } }),
    db.appointment.findMany({
      where: { appointmentDate: range },
      select: {
        status: true,
        totalAmount: true,
        paidAmount: true,
        items: { select: { total: true, status: true, service: { select: { kind: true } } } },
      },
    }),
    db.stockMovement.findMany({
      where: { createdAt: range },
      select: { type: true, qty: true, unitCost: true },
    }),
    db.expense.findMany({
      where: { spentAt: range, voidedAt: null },
      select: { category: true, amount: true, paidFrom: true },
    }),
    db.stockReceipt.findMany({
      where: { receivedAt: range, voidedAt: null },
      select: { total: true, paidFrom: true },
    }),
    db.product.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        unit: true,
        category: true,
        qtyOnHand: true,
        avgCost: true,
        minQty: true,
      },
    }),
  ]);
  return buildFinanceReport({
    payments,
    visits: visits.map((v) => ({
      ...v,
      items: v.items.map((i) => ({ kind: i.service.kind, total: i.total, status: i.status })),
    })),
    movements,
    expenses,
    receipts,
    products,
  });
}
