import type { PrismaClient } from '../../generated/prisma-sqlite';
import type {
  CashMovementDto,
  CashMovementType,
  PaymentMethod,
  ShiftDto,
  ShiftSummaryDto,
} from '../../shared/clinic';
import { RefusedError } from '../ipc/ipc-safe';

/**
 * Cash shifts (v2.6, SavdoChef's "smena", src/main/sessions there): every payment is taken inside
 * the one open shift of the clinic (all desks share it). The drawer is counted when the shift
 * opens and again when it closes:
 *
 *   expected = opening cash + cash payments of the shift + cash in - cash out
 *
 * The expected figure is frozen on the shift at close, so its count never changes afterwards.
 * Money is kept to the tiyin (2 decimals); so'm amounts are integers in practice.
 */

type Db = PrismaClient;
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
type DbOrTx = Db | Tx;

export const PAYMENT_METHODS: readonly PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'INSURANCE'];
const MOVEMENT_TYPES: readonly CashMovementType[] = ['PAY_IN', 'PAY_OUT'];
/** No drawer holds more; also stops a typo of a few extra zeros. */
const MAX_AMOUNT = 1_000_000_000;

export const money = (n: number): number => Math.round(n * 100) / 100;
const num = (v: unknown): number => Number(v ?? 0);

/** A positive amount within MAX_AMOUNT, or `errors.invalidAmount`. `zero` allows 0 (opening). */
export function amountOf(v: unknown, opts: { zero?: boolean } = {}): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0 || (n === 0 && !opts.zero) || n > MAX_AMOUNT) {
    throw new RefusedError('errors.invalidAmount');
  }
  return money(n);
}

const people = {
  openedBy: { select: { fullName: true } },
  closedBy: { select: { fullName: true } },
} as const;

type ShiftRow = {
  id: string;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  openingCash: unknown;
  countedCash: unknown;
  expectedCash: unknown;
  fiscalZReportId: number | null;
  fiscalZClosedAt: Date | null;
  openedBy: { fullName: string } | null;
  closedBy: { fullName: string } | null;
};

function toShiftDto(s: ShiftRow): ShiftDto {
  const counted = s.countedCash === null ? null : num(s.countedCash);
  const expected = s.expectedCash === null ? null : num(s.expectedCash);
  return {
    id: s.id,
    status: s.status === 'OPEN' ? 'OPEN' : 'CLOSED',
    openedAt: s.openedAt.toISOString(),
    closedAt: s.closedAt ? s.closedAt.toISOString() : null,
    openedBy: s.openedBy?.fullName ?? null,
    closedBy: s.closedBy?.fullName ?? null,
    openingCash: num(s.openingCash),
    countedCash: counted,
    expectedCash: expected,
    difference: counted !== null && expected !== null ? money(counted - expected) : null,
    fiscalZReportId: s.fiscalZReportId,
    fiscalZClosedAt: s.fiscalZClosedAt ? s.fiscalZClosedAt.toISOString() : null,
  };
}

export async function getOpenShift(db: DbOrTx): Promise<ShiftDto | null> {
  const s = await db.shift.findFirst({ where: { status: 'OPEN' }, include: people });
  return s ? toShiftDto(s) : null;
}

/** The open shift's id, or `errors.noOpenShift`: money is never taken without one. */
export async function requireOpenShiftId(db: DbOrTx): Promise<string> {
  const open = await db.shift.findFirst({ where: { status: 'OPEN' }, select: { id: true } });
  if (!open) throw new RefusedError('errors.noOpenShift');
  return open.id;
}

export async function listShifts(db: DbOrTx, limit = 30): Promise<ShiftDto[]> {
  const take = Math.min(Math.max(1, Math.floor(limit) || 30), 200);
  const rows = await db.shift.findMany({ include: people, orderBy: { openedAt: 'desc' }, take });
  return rows.map(toShiftDto);
}

function isUnique(e: unknown): boolean {
  return (e as { code?: string })?.code === 'P2002';
}

export async function openShift(
  db: Db,
  actorId: string,
  input: { openingCash?: unknown },
): Promise<ShiftDto> {
  const openingCash = amountOf(input?.openingCash ?? 0, { zero: true });
  try {
    const s = await db.shift.create({
      data: { status: 'OPEN', openGuard: 1, openedById: actorId, openingCash },
      include: people,
    });
    return toShiftDto(s);
  } catch (e) {
    // shifts.open_guard is UNIQUE: the database itself refuses a second open shift.
    if (isUnique(e)) throw new RefusedError('errors.shiftAlreadyOpen');
    throw e;
  }
}

export interface CashFigures {
  opening: number;
  sales: Record<PaymentMethod, number>;
  /** Visits paid (in part or in full) in this shift. */
  visits: number;
  payIn: number;
  payOut: number;
  expected: number;
}

/** The drawer's figures for a shift, from the rows as they are now. */
export async function cashFigures(
  db: DbOrTx,
  shift: { id: string; openingCash: unknown },
): Promise<CashFigures> {
  const [payments, movements] = await Promise.all([
    db.payment.findMany({
      where: { shiftId: shift.id },
      select: { appointmentId: true, method: true, amount: true },
    }),
    db.cashMovement.findMany({
      where: { shiftId: shift.id },
      select: { type: true, amount: true },
    }),
  ]);
  const sales = { CASH: 0, CARD: 0, TRANSFER: 0, INSURANCE: 0 } as Record<PaymentMethod, number>;
  for (const p of payments) {
    const m = (PAYMENT_METHODS as readonly string[]).includes(p.method)
      ? (p.method as PaymentMethod)
      : 'CASH';
    sales[m] = money(sales[m] + num(p.amount));
  }
  const total = (type: CashMovementType) =>
    money(movements.filter((m) => m.type === type).reduce((s, m) => s + num(m.amount), 0));
  const opening = num(shift.openingCash);
  const payIn = total('PAY_IN');
  const payOut = total('PAY_OUT');
  return {
    opening,
    sales,
    visits: new Set(payments.map((p) => p.appointmentId)).size,
    payIn,
    payOut,
    expected: money(opening + sales.CASH + payIn - payOut),
  };
}

function toMovementDto(m: {
  id: string;
  type: string;
  amount: unknown;
  note: string;
  createdAt: Date;
  createdBy: { fullName: string } | null;
}): CashMovementDto {
  return {
    id: m.id,
    type: m.type === 'PAY_OUT' ? 'PAY_OUT' : 'PAY_IN',
    amount: num(m.amount),
    note: m.note,
    createdAt: m.createdAt.toISOString(),
    createdBy: m.createdBy?.fullName ?? null,
  };
}

export async function shiftSummary(db: DbOrTx, shiftId: string): Promise<ShiftSummaryDto> {
  const shift = await db.shift.findUnique({ where: { id: String(shiftId) }, include: people });
  if (!shift) throw new RefusedError('errors.notFound');
  const f = await cashFigures(db, shift);
  const movements = await db.cashMovement.findMany({
    where: { shiftId: shift.id },
    include: { createdBy: { select: { fullName: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const dto = toShiftDto(shift);
  // A closed shift keeps the figure it was counted against.
  const expected = dto.expectedCash ?? f.expected;
  return {
    shift: dto,
    sales: f.sales,
    salesTotal: money(Object.values(f.sales).reduce((s, v) => s + v, 0)),
    visits: f.visits,
    payIn: f.payIn,
    payOut: f.payOut,
    expectedCash: expected,
    movements: movements.map(toMovementDto),
  };
}

/**
 * Cash in or out of the open shift's drawer. Never edited or deleted: a mistake is undone with
 * the opposite movement. Taking out more than the drawer should hold is refused.
 */
export async function addCashMovement(
  db: Db,
  actorId: string,
  input: { type?: unknown; amount?: unknown; note?: unknown },
): Promise<CashMovementDto> {
  const type = input?.type as CashMovementType;
  if (!MOVEMENT_TYPES.includes(type)) throw new RefusedError('errors.invalidInput');
  const amount = amountOf(input?.amount);
  const note = typeof input?.note === 'string' ? input.note.trim().slice(0, 200) : '';
  return db.$transaction(async (tx) => {
    const shift = await tx.shift.findFirst({ where: { status: 'OPEN' } });
    if (!shift) throw new RefusedError('errors.noOpenShift');
    if (type === 'PAY_OUT') {
      const { expected } = await cashFigures(tx, shift);
      if (amount > expected) throw new RefusedError('errors.payOutExceedsCash');
    }
    const created = await tx.cashMovement.create({
      data: { shiftId: shift.id, type, amount, note, createdById: actorId },
      include: { createdBy: { select: { fullName: true } } },
    });
    return toMovementDto(created);
  });
}

/** Closes the open shift with the counted cash; the expected cash is frozen on it. */
export async function closeShift(
  db: Db,
  actorId: string,
  input: { shiftId?: unknown; countedCash?: unknown },
): Promise<ShiftDto> {
  const countedCash = amountOf(input?.countedCash ?? 0, { zero: true });
  return db.$transaction(async (tx) => {
    const shift = await tx.shift.findUnique({ where: { id: String(input?.shiftId ?? '') } });
    if (!shift) throw new RefusedError('errors.notFound');
    if (shift.status !== 'OPEN') throw new RefusedError('errors.shiftClosed');
    const { expected } = await cashFigures(tx, shift);
    const closed = await tx.shift.update({
      where: { id: shift.id },
      data: {
        status: 'CLOSED',
        openGuard: null,
        closedAt: new Date(),
        closedById: actorId,
        countedCash,
        expectedCash: expected,
      },
      include: people,
    });
    return toShiftDto(closed);
  });
}

/** Only a shift with no payments and no cash movements can be deleted (opened by mistake). */
export async function deleteShift(db: Db, id: unknown): Promise<void> {
  const shift = await db.shift.findUnique({
    where: { id: String(id ?? '') },
    include: { _count: { select: { payments: true, cashMovements: true } } },
  });
  if (!shift) throw new RefusedError('errors.notFound');
  if (shift._count.payments > 0 || shift._count.cashMovements > 0) {
    throw new RefusedError('errors.shiftNotEmpty');
  }
  await db.shift.delete({ where: { id: shift.id } });
}
