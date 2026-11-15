/**
 * Cloud sync of the MAIN till with the posclinic server (contract: .claude/rules/server-api.md).
 * No Electron here: the database and the transport are passed in, so tests run it against a real
 * SQLite file and a fake server.
 *
 * Up: every row of users, doctors, services, patients, appointments changed since the entity's
 *     push cursor, oldest first, 200 at a time. The cursor is `<updatedAt ISO>|<id>` of the last
 *     row sent, so rows sharing one timestamp are neither skipped nor sent forever.
 * Down: doctors, services, users the web dashboard changed since the last pull's `serverTime`.
 *     A row is applied only if it is new or newer (`updatedAt`), the same last-write-wins rule
 *     the server uses. Patients and visits are only ever created on tills, so they never come down.
 */

export const BATCH = 200;

export const PUSH_ORDER = ['users', 'doctors', 'services', 'patients', 'appointments'] as const;
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
}

// ── cursors ───────────────────────────────────────────────────────────────────────────────

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

export function cursorOf(row: Row): string {
  return `${iso(row.updatedAt)}|${row.id}`;
}

export function parseCursor(cursor: string | null | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  const bar = cursor.indexOf('|');
  const at = new Date(cursor.slice(0, bar));
  if (bar < 0 || Number.isNaN(at.getTime())) return null;
  return { at, id: cursor.slice(bar + 1) };
}

/** Rows strictly after the cursor in (updatedAt, id) order. */
function afterCursor(cursor: { at: Date; id: string } | null) {
  if (!cursor) return {};
  return {
    OR: [{ updatedAt: { gt: cursor.at } }, { updatedAt: cursor.at, id: { gt: cursor.id } }],
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
      const { items, synced: _s, syncedAt: _sa, ...rest } = row;
      const list = (items as Record<string, unknown>[] | undefined) ?? [];
      return dates({
        ...rest,
        totalAmount: Number(rest.totalAmount),
        paidAmount: Number(rest.paidAmount),
        items: list.map(({ appointmentId: _a, ...item }) => ({
          ...item,
          unitPrice: Number(item.unitPrice),
          total: Number(item.total),
        })),
      });
    }
    case 'services':
      return dates({ ...row, price: Number(row.price) });
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
    total += await db[MODEL[entity]].count({ where: afterCursor(cursor) });
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
      const rows: Row[] = await db[MODEL[entity]].findMany({
        where: afterCursor(cursor),
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: BATCH,
        ...(entity === 'appointments' ? { include: { items: true } } : {}),
      });
      if (rows.length === 0) break;
      const answer = await transport.push({ [entity]: rows.map((r) => toWire(entity, r)) });
      for (const r of answer.rejected) {
        // A refused row cannot be retried into success (e.g. a phone used by another user):
        // log it and move on, or it would block every later row forever.
        log.warn(`[sync] server refused ${r.entity} ${r.id}: ${r.reason}`);
      }
      result.pushed += rows.length - answer.rejected.length;
      result.rejected += answer.rejected.length;
      await writeState(db, entity, { pushCursor: cursorOf(rows[rows.length - 1]!) });
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
