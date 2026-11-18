/**
 * Cloud sync of the MAIN till with the posclinic server (contract: .claude/rules/server-api.md).
 * No Electron here: the database and the transport are passed in, so tests run it against a real
 * SQLite file and a fake server.
 *
 * Up: every row of users, doctors, services, patients, cases, referrals, appointments (with their
 *     lines and course sessions), vitals, results and (v2.10) products, deliveries, stock
 *     movements, expenses and payments changed since the entity's
 *     push cursor, oldest first, 200 at a time. The cursor is `<updatedAt ISO>|<id>` of the last
 *     row sent, so rows sharing one timestamp are neither skipped nor sent forever.
 * Down: doctors, services, users the web dashboard changed since the last pull's `serverTime`.
 *     A row is applied only if it is new or newer (`updatedAt`), the same last-write-wins rule
 *     the server uses. Patients and visits are only ever created on tills, so they never come down.
 */

export const BATCH = 200;

/** What a row points at goes first (the server's apply order, server-api.md). */
export const PUSH_ORDER = [
  // v2.5: the clinic's own types, before the users and services that point at them.
  'serviceTypes',
  'staffTypes',
  'users',
  'doctors',
  'services',
  'patients',
  'cases',
  'referrals',
  'appointments',
  'vitals',
  'results',
  // v2.10: stock and money, for the web dashboard's money report. Up only.
  'products',
  'stockReceipts',
  'stockMovements',
  'expenses',
  'payments',
] as const;
export type PushEntity = (typeof PUSH_ORDER)[number];
export const PULL_ENTITIES = ['users', 'doctors', 'services'] as const;
type PullEntity = (typeof PULL_ENTITIES)[number];

type Row = Record<string, unknown> & { id: string; updatedAt: Date | string };

/** The part of the till's PrismaClient sync uses (models are `any`: the client is generated). */
export interface SyncDb {
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  user: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  doctor: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  service: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  patient: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  appointment: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  clinicalCase: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  referral: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  patientVitals: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  analysisResult: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  serviceType: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  staffType: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  product: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  stockReceipt: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  stockMovement: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  expense: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  payment: any;
  // biome-ignore lint/suspicious/noExplicitAny: generated Prisma delegates
  syncState: any;
}

export interface PushAnswer {
  accepted: Partial<Record<PushEntity, number>>;
  rejected: { entity: string; id: string; reason: string }[];
  serverTime: string;
}

export interface PullAnswer {
  doctors: Row[];
  services: Row[];
  users: Row[];
  serverTime: string;
}

/** HTTP to the server; throws SyncHttpError on a non-2xx answer. */
export interface SyncTransport {
  push(body: Partial<Record<PushEntity, unknown[]>>): Promise<PushAnswer>;
  pull(since: string | null): Promise<PullAnswer>;
}

export class SyncHttpError extends Error {
  constructor(
    readonly status: number,
    /** The server's i18n key (`server.errors.*`), or ''. */
    readonly key: string,
  ) {
    super(`sync http ${status} ${key}`);
  }
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  rejected: number;
  /** Entities the server did not process (unknown to it): their cursor stays, sent again later. */
  skipped?: string[];
}

// ── cursors ───────────────────────────────────────────────────────────────────────────────

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

/**
 * The column a push cursor follows. Payments are never changed and have no `updatedAt`: they
 * follow `createdAt` (and go up with `updatedAt = createdAt`).
 */
export const CURSOR_FIELD: Partial<Record<PushEntity, 'createdAt'>> = { payments: 'createdAt' };

export function cursorOf(row: Row, field: 'updatedAt' | 'createdAt' = 'updatedAt'): string {
  return `${iso(row[field] as Date | string)}|${row.id}`;
}

export function parseCursor(cursor: string | null | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  const bar = cursor.indexOf('|');
  const at = new Date(cursor.slice(0, bar));
  if (bar < 0 || Number.isNaN(at.getTime())) return null;
  return { at, id: cursor.slice(bar + 1) };
}

/** Rows strictly after the cursor in (field, id) order. */
function afterCursor(
  cursor: { at: Date; id: string } | null,
  field: 'updatedAt' | 'createdAt' = 'updatedAt',
) {
  if (!cursor) return {};
  return {
    OR: [{ [field]: { gt: cursor.at } }, { [field]: cursor.at, id: { gt: cursor.id } }],
  };
}

/** Last write wins: apply when there is nothing yet, or the incoming row is strictly newer. */
export function isNewer(
  incoming: Date | string,
  stored: Date | string | null | undefined,
): boolean {
  if (stored === null || stored === undefined) return true;
  return new Date(incoming).getTime() > new Date(stored).getTime();
}

// ── wire format (contract row shapes) ─────────────────────────────────────────────────────

function dates<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out as T;
}

export function toWire(entity: PushEntity, row: Record<string, unknown>): Record<string, unknown> {
  switch (entity) {
    case 'users': {
      // The till column is `password` (a bcrypt hash); it never holds plaintext.
      const { password, clinicId: _c, ...rest } = row;
      return dates({ ...rest, passwordHash: password });
    }
    case 'appointments': {
      const { items, synced: _s, syncedAt: _sa, ...all } = row;
      // The fiscal receipt's state (v2.6) is the till's own: never sent.
      const rest = Object.fromEntries(Object.entries(all).filter(([k]) => !k.startsWith('fiscal')));
      const list = (items as Record<string, unknown>[] | undefined) ?? [];
      return dates({
        ...rest,
        totalAmount: Number(rest.totalAmount),
        discountAmount: Number(rest.discountAmount ?? 0),
        paidAmount: Number(rest.paidAmount),
        items: list.map(({ appointmentId: _a, sessions, ...item }) =>
          dates({
            ...item,
            unitPrice: Number(item.unitPrice),
            discount: Number(item.discount ?? 0),
            total: Number(item.total),
            sessions: ((sessions as Record<string, unknown>[] | undefined) ?? []).map(
              ({ itemId: _i, createdAt: _c, updatedAt: _u, ...s }) => dates(s),
            ),
          }),
        ),
      });
    }
    case 'services': {
      // The picture is the till's own (v2.5): never sent to the server.
      const { image: _image, ...rest } = row;
      return dates({ ...rest, price: Number(rest.price) });
    }
    case 'vitals': {
      const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      return dates({
        ...row,
        heightCm: n(row.heightCm),
        weightKg: n(row.weightKg),
        temperature: n(row.temperature),
      });
    }
    case 'results':
      return dates({
        ...row,
        value: row.value === null || row.value === undefined ? null : Number(row.value),
      });
    // v2.10. Decimals go as numbers; the drawer link is the till's own (shifts stay on it).
    case 'products':
      return dates({
        ...row,
        minQty: row.minQty === null || row.minQty === undefined ? null : Number(row.minQty),
        qtyOnHand: Number(row.qtyOnHand),
        avgCost: Number(row.avgCost),
      });
    case 'stockReceipts': {
      const { cashMovementId: _c, ...rest } = row;
      return dates({ ...rest, total: Number(rest.total) });
    }
    case 'stockMovements':
      return dates({ ...row, qty: Number(row.qty), unitCost: Number(row.unitCost) });
    case 'expenses': {
      const { cashMovementId: _c, ...rest } = row;
      return dates({ ...rest, amount: Number(rest.amount) });
    }
    case 'payments': {
      const { shiftId: _s, ...rest } = row;
      return dates({ ...rest, amount: Number(rest.amount), updatedAt: rest.createdAt });
    }
    default:
      return dates(row);
  }
}

/** A pulled row as the till's Prisma model wants it (Dates, `password`). */
export function fromWire(entity: PullEntity, row: Row): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...row,
    createdAt: new Date(row.createdAt as string),
    updatedAt: new Date(row.updatedAt),
  };
  // Server-only bookkeeping never reaches the till.
  delete base.clinicId;
  delete base.syncedAt;
  if (entity === 'users') {
    base.password = base.passwordHash;
    delete base.passwordHash;
  }
  return base;
}

// ── the run ───────────────────────────────────────────────────────────────────────────────

const MODEL: Record<PushEntity, keyof SyncDb> = {
  users: 'user',
  doctors: 'doctor',
  services: 'service',
  patients: 'patient',
  appointments: 'appointment',
  cases: 'clinicalCase',
  referrals: 'referral',
  vitals: 'patientVitals',
  results: 'analysisResult',
  serviceTypes: 'serviceType',
  staffTypes: 'staffType',
  products: 'product',
  stockReceipts: 'stockReceipt',
  stockMovements: 'stockMovement',
  expenses: 'expense',
  payments: 'payment',
};

/** Fields each pulled entity may write on the till (nothing else from the server is trusted). */
const PULL_FIELDS: Record<PullEntity, string[]> = {
  users: ['fullName', 'phone', 'email', 'role', 'active', 'password', 'createdAt', 'updatedAt'],
  doctors: ['fullName', 'phone', 'specialty', 'licenseNo', 'active', 'createdAt', 'updatedAt'],
  services: [
    'code',
    'name',
    'description',
    'price',
    'duration',
    // v2.5: the web edits the type of a service too.
    'kind',
    'isFollowUp',
    'resultType',
    'resultUnit',
    'referenceRange',
    'active',
    'createdAt',
    'updatedAt',
  ],
};

function pick(row: Record<string, unknown>, fields: string[]) {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f in row) out[f] = row[f];
  return out;
}

async function readState(db: SyncDb, entity: string) {
  return (await db.syncState.findUnique({ where: { entity } })) as {
    pushCursor: string | null;
    pullCursor: string | null;
  } | null;
}

async function writeState(
  db: SyncDb,
  entity: string,
  data: { pushCursor?: string; pullCursor?: string },
) {
  await db.syncState.upsert({ where: { entity }, update: data, create: { entity, ...data } });
}

/** Rows changed since the push cursor, per entity (for the status screen). */
export async function pendingCount(db: SyncDb): Promise<number> {
  let total = 0;
  for (const entity of PUSH_ORDER) {
    const cursor = parseCursor((await readState(db, entity))?.pushCursor);
    total += await db[MODEL[entity]].count({
      where: afterCursor(cursor, CURSOR_FIELD[entity]),
    });
  }
  return total;
}

export async function runSync(
  db: SyncDb,
  transport: SyncTransport,
  log: { warn(message: string): void } = { warn: () => undefined },
): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, pulled: 0, rejected: 0 };

  // Up, in dependency order: an appointment's patient, doctor and services reach the server first.
  for (const entity of PUSH_ORDER) {
    for (;;) {
      const cursor = parseCursor((await readState(db, entity))?.pushCursor);
      const field = CURSOR_FIELD[entity] ?? 'updatedAt';
      const rows: Row[] = await db[MODEL[entity]].findMany({
        where: afterCursor(cursor, field),
        orderBy: [{ [field]: 'asc' }, { id: 'asc' }],
        take: BATCH,
        ...(entity === 'appointments'
          ? { include: { items: { include: { sessions: { orderBy: { number: 'asc' } } } } } }
          : {}),
      });
      if (rows.length === 0) break;
      const answer = await transport.push({ [entity]: rows.map((r) => toWire(entity, r)) });
      // The server lists every entity it processed in `accepted` (0 included). One it does not
      // know (an older server, or a body field its validation dropped) is absent: keep the
      // cursor, so the rows are sent again once the server takes them, never silently skipped.
      if (!answer.accepted || !(entity in answer.accepted)) {
        log.warn(`[sync] server did not take ${entity} yet; will send again later`);
        result.skipped = [...(result.skipped ?? []), entity];
        break;
      }
      for (const r of answer.rejected) {
        // A refused row cannot be retried into success (e.g. a phone used by another user):
        // log it and move on, or it would block every later row forever.
        log.warn(`[sync] server refused ${r.entity} ${r.id}: ${r.reason}`);
      }
      result.pushed += rows.length - answer.rejected.length;
      result.rejected += answer.rejected.length;
      await writeState(db, entity, { pushCursor: cursorOf(rows[rows.length - 1]!, field) });
      if (rows.length < BATCH) break;
    }
  }

  // Down: the dashboard's catalog edits.
  const since = (await readState(db, 'pull'))?.pullCursor ?? null;
  const answer = await transport.pull(since);
  for (const entity of PULL_ENTITIES) {
    const model = db[MODEL[entity]];
    for (const raw of answer[entity] ?? []) {
      const row = fromWire(entity, raw);
      const stored = await model.findUnique({ where: { id: raw.id }, select: { updatedAt: true } });
      if (!isNewer(row.updatedAt as Date, stored?.updatedAt)) continue;
      const data = pick(row, PULL_FIELDS[entity]);
      try {
        await model.upsert({
          where: { id: raw.id },
          update: data,
          create: { id: raw.id, ...data },
        });
        result.pulled += 1;
      } catch (e) {
        // e.g. a web-made service whose code a different local service already uses.
        log.warn(
          `[sync] could not apply ${entity} ${raw.id}: ${(e as Error).message.split('\n')[0]}`,
        );
      }
    }
  }
  await writeState(db, 'pull', { pullCursor: answer.serverTime });

  return result;
}
