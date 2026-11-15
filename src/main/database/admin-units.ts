import { createHash } from 'node:crypto';
import type { AdminUnitType } from '../../shared/address';

/**
 * Uzbekistan administrative units (official SOATO / MHOBT classifier), bundled with the till and
 * imported into `admin_units` when the clinic DB opens. No Electron import: tests run it against
 * a real temp DB. How to update the data: docs/addresses.md.
 */

export interface AdminUnitRecord {
  code: string;
  parentCode: string | null;
  type: AdminUnitType;
  nameUz: string;
  nameUzCyrl: string | null;
  nameRu: string | null;
  nameEn: string | null;
}

export interface AdminUnitDataset {
  source: { name: string; url: string; retrievedAt: string; version?: string | null }[];
  generatedAt: string;
  units: AdminUnitRecord[];
}

const LEVEL1_TYPES = new Set<AdminUnitType>(['REGION', 'REPUBLIC', 'CITY']);
const LEVEL2_TYPES = new Set<AdminUnitType>(['DISTRICT', 'CITY']);
const SETTING_KEY = 'admin_units_version';

/**
 * Problems that make a dataset unsafe to import (empty list = valid). Checked before anything is
 * written, so a broken file never half-replaces good data.
 */
export function validateDataset(ds: AdminUnitDataset): string[] {
  const problems: string[] = [];
  if (!Array.isArray(ds?.units) || ds.units.length === 0) return ['no units'];
  const byCode = new Map<string, AdminUnitRecord>();
  for (const u of ds.units) {
    if (!u || typeof u.code !== 'string' || !/^\d{4,10}$/.test(u.code)) {
      problems.push(`bad code: ${JSON.stringify(u?.code)}`);
      continue;
    }
    if (byCode.has(u.code)) problems.push(`duplicate code ${u.code}`);
    byCode.set(u.code, u);
    if (!u.nameUz?.trim()) problems.push(`${u.code}: empty nameUz`);
  }
  for (const u of byCode.values()) {
    if (u.parentCode === null) {
      if (!LEVEL1_TYPES.has(u.type)) problems.push(`${u.code}: type ${u.type} cannot be top-level`);
    } else {
      const parent = byCode.get(u.parentCode);
      if (!parent) problems.push(`${u.code}: parent ${u.parentCode} missing`);
      else if (parent.parentCode !== null)
        problems.push(`${u.code}: parent ${u.parentCode} is not top-level`);
      if (!LEVEL2_TYPES.has(u.type)) problems.push(`${u.code}: type ${u.type} cannot be a child`);
    }
  }
  return problems;
}

export function datasetVersion(ds: AdminUnitDataset): string {
  return createHash('sha256').update(JSON.stringify(ds.units)).digest('hex').slice(0, 16);
}

export interface ImportResult {
  skipped: boolean;
  upserted: number;
  deactivated: number;
}

// biome-ignore lint/suspicious/noExplicitAny: generated Prisma client
type Db = any;

/**
 * Idempotent import: does nothing when this exact dataset was imported before; otherwise
 * upserts every unit (parents first) and marks units no longer in the dataset inactive. Never
 * deletes, so patients that reference an abolished unit keep a valid code. One transaction.
 */
export async function importAdminUnits(db: Db, ds: AdminUnitDataset): Promise<ImportResult> {
  const problems = validateDataset(ds);
  if (problems.length) {
    throw new Error(`admin units dataset invalid: ${problems.slice(0, 5).join('; ')}`);
  }
  const version = datasetVersion(ds);
  const current = await db.setting.findUnique({ where: { key: SETTING_KEY } });
  if (current && JSON.parse(current.value) === version) {
    return { skipped: true, upserted: 0, deactivated: 0 };
  }

  const ordered = [...ds.units].sort(
    (a, b) => Number(a.parentCode !== null) - Number(b.parentCode !== null),
  );
  const codes = ordered.map((u) => u.code);
  const now = new Date();

  return db.$transaction(
    async (tx: Db) => {
      for (const u of ordered) {
        const data = {
          parentCode: u.parentCode,
          type: u.type,
          level: u.parentCode === null ? 1 : 2,
          nameUz: u.nameUz.trim(),
          nameUzCyrl: u.nameUzCyrl?.trim() || null,
          nameRu: u.nameRu?.trim() || null,
          nameEn: u.nameEn?.trim() || null,
          active: true,
          updatedAt: now,
        };
        await tx.adminUnit.upsert({
          where: { code: u.code },
          update: data,
          create: { code: u.code, ...data },
        });
      }
      const gone = await tx.adminUnit.updateMany({
        where: { code: { notIn: codes }, active: true },
        data: { active: false, updatedAt: now },
      });
      await tx.setting.upsert({
        where: { key: SETTING_KEY },
        update: { value: JSON.stringify(version) },
        create: { key: SETTING_KEY, value: JSON.stringify(version) },
      });
      return { skipped: false, upserted: ordered.length, deactivated: gone.count };
      // ~220 sequential upserts: Prisma's 5 s default can be too short on an old till's disk.
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
