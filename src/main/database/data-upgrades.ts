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
