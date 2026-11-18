import type { PrismaClient } from '../../generated/prisma-sqlite';
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  PAID_FROM,
  type PaidFrom,
  PRODUCT_CATEGORIES,
  type ProductCategory,
} from '../../shared/stock';
import { RefusedError } from '../ipc/ipc-safe';
import { amountOf, cashFigures, money } from './shifts';

/**
 * Stock (v2.10). Every change of a product's quantity is one `StockMovement` row, written in the
 * same transaction as the product's `qtyOnHand` / `avgCost` and as whatever caused it (a payment,
 * a ticked session, a delivery), so money and stock never disagree. Rows are never edited: a
 * mistake is the opposite movement.
 *
 * Cost is the weighted average: a delivery of q units at price p onto Q units at average A gives
 * (Q·A + q·p) / (Q + q). Out movements are valued at the average of that moment. Stock may go
 * below zero (sold before the delivery was entered): reception is never stopped from working.
 */

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** No line holds more; also stops a typo of a few extra zeros. */
const MAX_QTY = 1_000_000;
/** Quantities to 3 decimals (ml, g). */
export const qtyRound = (v: number): number => Math.round(v * 1000) / 1000;
const num = (v: unknown): number => Number(v ?? 0);

/** A positive quantity, or `errors.invalidStockQty`. `zero` allows 0 (a stocktake count). */
export function qtyOf(v: unknown, opts: { zero?: boolean } = {}): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  const q = qtyRound(n);
  if (!Number.isFinite(n) || q < 0 || (q === 0 && !opts.zero) || q > MAX_QTY) {
    throw new RefusedError('errors.invalidStockQty');
  }
  return q;
}

/** A unit price; 0 is allowed (a free sample still counts in stock). */
const priceOf = (v: unknown) => amountOf(v ?? 0, { zero: true });

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export function categoryOf(v: unknown): ProductCategory {
  if (!(PRODUCT_CATEGORIES as readonly unknown[]).includes(v)) {
    throw new RefusedError('errors.invalidInput');
  }
  return v as ProductCategory;
}
export function expenseCategoryOf(v: unknown): ExpenseCategory {
  if (!(EXPENSE_CATEGORIES as readonly unknown[]).includes(v)) {
    throw new RefusedError('errors.invalidInput');
  }
  return v as ExpenseCategory;
}
export function paidFromOf(v: unknown): PaidFrom {
  if (!(PAID_FROM as readonly unknown[]).includes(v)) throw new RefusedError('errors.invalidInput');
  return v as PaidFrom;
}

// ── The one place a product's quantity changes ────────────────────────────────────────────

interface Move {
  productId: string;
  type: string;
  /** Signed: + in, − out. */
  qty: number;
  /** For + moves: the price they come in at (the average is recomputed). Else: the average now. */
  unitCost?: number;
  receiptId?: string | null;
  itemId?: string | null;
  sessionId?: string | null;
  note?: string;
  actorId: string | null;
}

export async function move(tx: Tx, m: Move) {
  const p = await tx.product.findUnique({ where: { id: m.productId } });
  if (!p) throw new RefusedError('errors.productNotFound');
  const onHand = num(p.qtyOnHand);
  const avg = num(p.avgCost);
  const after = qtyRound(onHand + m.qty);
  let unitCost = avg;
  let nextAvg = avg;
  if (m.qty > 0 && m.unitCost !== undefined) {
    unitCost = m.unitCost;
    // Onto stock at or below zero the new price is the average; else weighted.
    nextAvg = onHand <= 0 || after <= 0 ? unitCost : (onHand * avg + m.qty * unitCost) / after;
  } else if (m.qty < 0 && m.unitCost !== undefined) {
    // Taking a delivery line back out at its own price (VOID).
    unitCost = m.unitCost;
    nextAvg = after > 0 ? Math.max(0, (onHand * avg + m.qty * unitCost) / after) : avg;
  }
  await tx.product.update({
    where: { id: p.id },
    data: { qtyOnHand: after, avgCost: Math.round(nextAvg * 10000) / 10000 },
  });
  return tx.stockMovement.create({
    data: {
      productId: p.id,
      type: m.type,
      qty: qtyRound(m.qty),
      unitCost: Math.round(unitCost * 10000) / 10000,
      receiptId: m.receiptId ?? null,
      itemId: m.itemId ?? null,
      sessionId: m.sessionId ?? null,
      note: (m.note ?? '').slice(0, 200),
      createdById: m.actorId,
    },
  });
}

/** A cash-out (or back in) of the open shift's drawer, inside the caller's transaction. */
export async function drawer(
  tx: Tx,
  type: 'PAY_OUT' | 'PAY_IN',
  amount: number,
  note: string,
  actorId: string | null,
) {
  const shift = await tx.shift.findFirst({ where: { status: 'OPEN' } });
  if (!shift) throw new RefusedError('errors.noOpenShift');
  if (type === 'PAY_OUT') {
    const { expected } = await cashFigures(tx, shift);
    if (amount > expected) throw new RefusedError('errors.payOutExceedsCash');
  }
  return tx.cashMovement.create({
    data: { shiftId: shift.id, type, amount, note: note.slice(0, 200), createdById: actorId },
  });
}

// ── Deliveries ────────────────────────────────────────────────────────────────────────────

const MAX_LINES = 200;

async function nextReceiptNumber(tx: Tx): Promise<string> {
  const last = await tx.stockReceipt.findFirst({
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const n = last ? Number(last.number.replace(/\D/g, '')) || 0 : 0;
  return `K-${String(n + 1).padStart(6, '0')}`;
}

export async function receive(tx: Tx, actorId: string, input: Record<string, unknown>) {
  // A repeated submit (double click, a satellite retry after a timeout) returns the first one.
  const id =
    typeof input?.id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(input.id) ? input.id : null;
  if (id) {
    const done = await tx.stockReceipt.findUnique({ where: { id } });
    if (done) return done;
  }
  const paidFrom = paidFromOf(input?.paidFrom);
  const raw = Array.isArray(input?.lines) ? input.lines : [];
  if (raw.length === 0 || raw.length > MAX_LINES) throw new RefusedError('errors.invalidInput');
  const lines = raw.map((l: Record<string, unknown>) => ({
    productId: String(l?.productId ?? ''),
    qty: qtyOf(l?.qty),
    unitCost: priceOf(l?.unitCost),
  }));
  const total = money(lines.reduce((s, l) => s + l.qty * l.unitCost, 0));
  const number = await nextReceiptNumber(tx);
  const cash =
    paidFrom === 'DRAWER' && total > 0
      ? await drawer(tx, 'PAY_OUT', total, `Kirim ${number}`, actorId)
      : null;
  const receipt = await tx.stockReceipt.create({
    data: {
      ...(id ? { id } : {}),
      number,
      supplier: text(input?.supplier, 200),
      docNo: text(input?.docNo, 100),
      note: text(input?.note, 500) ?? '',
      total,
      paidFrom,
      cashMovementId: cash?.id ?? null,
      createdById: actorId,
    },
  });
  for (const l of lines) {
    await move(tx, { ...l, type: 'IN', receiptId: receipt.id, actorId });
  }
  return receipt;
}

/** Undoes a delivery entered by mistake: its lines go back out, a drawer payment comes back. */
export async function voidReceipt(tx: Tx, actorId: string, id: string) {
  const r = await tx.stockReceipt.findUnique({
    where: { id },
    include: { movements: { where: { type: 'IN' } } },
  });
  if (!r) throw new RefusedError('errors.notFound');
  if (r.voidedAt) throw new RefusedError('errors.alreadyVoided');
  for (const m of r.movements) {
    await move(tx, {
      productId: m.productId,
      type: 'VOID',
      qty: -num(m.qty),
      unitCost: num(m.unitCost),
      receiptId: r.id,
      actorId,
    });
  }
  if (r.cashMovementId) {
    await drawer(tx, 'PAY_IN', num(r.total), `Bekor: kirim ${r.number}`, actorId);
  }
  return tx.stockReceipt.update({
    where: { id: r.id },
    data: { voidedAt: new Date(), voidedById: actorId },
  });
}

// ── Use and count ────────────────────────────────────────────────────────────────────────

export async function writeOff(tx: Tx, actorId: string, input: Record<string, unknown>) {
  return move(tx, {
    productId: String(input?.productId ?? ''),
    type: 'HOUSEHOLD',
    qty: -qtyOf(input?.qty),
    note: text(input?.note, 200) ?? '',
    actorId,
  });
}

/** A stocktake: each counted product that differs from what is on hand gets an ADJUST. */
export async function stocktake(tx: Tx, actorId: string, input: Record<string, unknown>) {
  const counts = Array.isArray(input?.counts) ? input.counts : [];
  if (counts.length === 0 || counts.length > 1000) throw new RefusedError('errors.invalidInput');
  const ids = (counts as Record<string, unknown>[]).map((c) => String(c?.productId ?? ''));
  // One count per product (two rows for one product would leave only the last one standing).
  if (new Set(ids).size !== ids.length) throw new RefusedError('errors.invalidInput');
  const note = text(input?.note, 200) ?? '';
  const made = [];
  for (const c of counts as Record<string, unknown>[]) {
    const productId = String(c?.productId ?? '');
    const counted = qtyOf(c?.counted, { zero: true });
    const p = await tx.product.findUnique({
      where: { id: productId },
      select: { qtyOnHand: true },
    });
    if (!p) throw new RefusedError('errors.productNotFound');
    const diff = qtyRound(counted - num(p.qtyOnHand));
    if (diff !== 0)
      made.push(await move(tx, { productId, type: 'ADJUST', qty: diff, note, actorId }));
  }
  return made;
}

// ── Sales and procedures: what a visit line takes from stock ─────────────────────────────

/**
 * Brings a visit line's stock in line with its state, idempotently (called after anything that
 * changes the line: payment, finishing it, ticking or un-ticking a session).
 *
 *  - A DIRECT_SALE line with a product: `quantity` units leave stock (SALE) once the line is DONE.
 *  - A course line (it has sessions): each done session uses the service's supplies once.
 *  - Any other line: done = `quantity` × the service's supplies (TREATMENT).
 *
 * What was taken is taken once; when the line or session is undone exactly that comes back, at
 * the same cost (so a later change of the supply list never miscounts).
 */
export async function settleItemStock(tx: Tx, itemId: string, actorId: string | null) {
  const item = await tx.appointmentItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      status: true,
      quantity: true,
      service: {
        select: {
          kind: true,
          product: { select: { id: true } },
          supplies: { select: { productId: true, qty: true } },
        },
      },
      sessions: { select: { id: true, doneAt: true } },
    },
  });
  if (!item) return;
  const supplies = item.service.supplies.map((s) => ({ productId: s.productId, qty: num(s.qty) }));
  if (item.sessions.length > 0) {
    for (const s of item.sessions) {
      await settleKey(tx, {
        itemId: item.id,
        sessionId: s.id,
        done: s.doneAt !== null && item.status !== 'CANCELLED',
        type: 'TREATMENT',
        plan: supplies,
        actorId,
      });
    }
    return;
  }
  const sale = item.service.kind === 'DIRECT_SALE';
  await settleKey(tx, {
    itemId: item.id,
    sessionId: null,
    done: item.status === 'DONE',
    type: sale ? 'SALE' : 'TREATMENT',
    plan: sale
      ? item.service.product
        ? [{ productId: item.service.product.id, qty: item.quantity }]
        : []
      : supplies.map((s) => ({ ...s, qty: s.qty * item.quantity })),
    actorId,
  });
}

async function settleKey(
  tx: Tx,
  k: {
    itemId: string;
    sessionId: string | null;
    done: boolean;
    type: 'SALE' | 'TREATMENT';
    plan: Array<{ productId: string; qty: number }>;
    actorId: string | null;
  },
) {
  const taken = await tx.stockMovement.findMany({
    where: { itemId: k.itemId, sessionId: k.sessionId, type: k.type },
    select: { productId: true, qty: true, unitCost: true },
  });
  // Net per product: what is still out, and at what cost it went out.
  const net = new Map<string, { qty: number; value: number }>();
  for (const m of taken) {
    const cur = net.get(m.productId) ?? { qty: 0, value: 0 };
    cur.qty += num(m.qty);
    cur.value += num(m.qty) * num(m.unitCost);
    net.set(m.productId, cur);
  }
  const out = [...net.entries()].filter(([, v]) => qtyRound(v.qty) !== 0);
  if (k.done && out.length === 0) {
    for (const p of k.plan) {
      const qty = qtyRound(p.qty);
      if (qty <= 0) continue;
      await move(tx, {
        productId: p.productId,
        type: k.type,
        qty: -qty,
        itemId: k.itemId,
        sessionId: k.sessionId,
        actorId: k.actorId,
      });
    }
  } else if (!k.done) {
    for (const [productId, v] of out) {
      await move(tx, {
        productId,
        type: k.type,
        qty: -qtyRound(v.qty),
        unitCost: v.value / v.qty,
        itemId: k.itemId,
        sessionId: k.sessionId,
        note: 'undo',
        actorId: k.actorId,
      });
    }
  }
}

/** Every line of a visit (after a payment, or a registration with free direct sales). */
export async function settleOrderStock(tx: Tx, appointmentId: string, actorId: string | null) {
  const items = await tx.appointmentItem.findMany({
    where: { appointmentId },
    select: { id: true },
  });
  for (const i of items) await settleItemStock(tx, i.id, actorId);
}
