import { normalizePhone } from '../../shared/phone';

/**
 * In-place DATA upgrades, run after the schema upgrades every time the clinic DB opens. Each one
 * is idempotent (it only touches rows not yet in the new form) and never deletes anything.
 * No Electron import, so tests run it against a real temp DB.
 */

// biome-ignore lint/suspicious/noExplicitAny: generated Prisma client
type Db = any;

export interface PhoneUpgradeResult {
  updated: number;
  /** Rows left as they were because their normalised phone already belongs to another patient. */
  skipped: string[];
}

/**
 * v2.2.4: patient phones saved before normalisation (e.g. "90 123-45-67") become `+998XXXXXXXXX`,
 * so search and the duplicate check see one person as one person. A row whose canonical phone is
 * already another patient's is SKIPPED, never merged: two records for one phone need a human.
 * Unparseable phones are left as typed. Goes through Prisma so `updatedAt` moves and cloud sync
 * sends the corrected phone up.
 */
export async function normalizePatientPhones(db: Db): Promise<PhoneUpgradeResult> {
  const rows: { id: string; phone: string }[] = await db.patient.findMany({
    select: { id: true, phone: true },
  });
  const taken = new Map(rows.map((r) => [r.phone, r.id]));
  const result: PhoneUpgradeResult = { updated: 0, skipped: [] };

  for (const row of rows) {
    const canonical = normalizePhone(row.phone);
    if (!canonical || canonical === row.phone) continue;
    const owner = taken.get(canonical);
    if (owner && owner !== row.id) {
      result.skipped.push(row.id);
      continue;
    }
    await db.patient.update({ where: { id: row.id }, data: { phone: canonical } });
    taken.delete(row.phone);
    taken.set(canonical, row.id);
    result.updated += 1;
  }
  return result;
}

/**
 * One-time (v2.5): send the clinical records and their orders to the server again. Before the
 * server's push DTO listed them, its validation silently dropped cases, referrals, vitals,
 * results and the custom types, while the till moved its cursors past them (so orders pointing at
 * a case were then refused with `missing_case`). Clearing those cursors makes the next sync send
 * everything again; the server keeps the newer version of each row, so it is harmless.
 * Returns the entities reset, or [] when already done.
 */
export const RESEND_ENTITIES = [
  'serviceTypes',
  'staffTypes',
  'users',
  'services',
  'patients',
  'cases',
  'referrals',
  'appointments',
  'vitals',
  'results',
] as const;
// _2: the first run (2026-11-16 10:19) raced the server fix by 30 s and was dropped again; the
// sync engine now keeps a cursor when the server does not process an entity, so this is the last.
const RESEND_KEY = 'sync_resend_v25_clinical_2';

export async function resendClinicalSyncOnce(db: Db): Promise<string[]> {
  const done = await db.setting.findUnique({ where: { key: RESEND_KEY } });
  if (done) return [];
  await db.$transaction([
    db.syncState.updateMany({
      where: { entity: { in: [...RESEND_ENTITIES] } },
      data: { pushCursor: null },
    }),
    db.setting.create({ data: { key: RESEND_KEY, value: JSON.stringify(new Date().toISOString()) } }),
  ]);
  return [...RESEND_ENTITIES];
}
