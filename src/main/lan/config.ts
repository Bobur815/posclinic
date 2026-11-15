import { randomUUID } from 'node:crypto';
import { DEFAULT_LAN_PORT, type LanRole } from '../../shared/lan';
import type { LanDb } from './db';

/**
 * This till's LAN role, in the `settings` table (key → JSON value; port of SavdoChef config.ts):
 * - `lan_role`: 'main' (default: every till in the field) or 'satellite';
 * - `lan_enabled`: a main till accepts satellites;
 * - `lan_port`: where a main till listens;
 * - `lan_lineage`: a random id the main till makes when it first pairs; a satellite keeps its
 *   main's and refuses a different till answering at that address;
 * - `lan_link`: a satellite's main address and device credential (the secret encrypted with the
 *   machine's key, Electron safeStorage, injected as `Cipher`).
 */

export interface SatelliteLink {
  mainUrl: string;
  deviceId: string;
  secret: string;
  lineage: string;
  /** The main till's version when it paired (shown only). */
  mainVersion: string;
  /** The clinic the main till is linked to (shown on the satellite). */
  clinicId: string | null;
  clinicName: string | null;
}

export interface Cipher {
  /** Recorded with the value, so a later read knows how to open it whatever is available then. */
  name: 'safe' | 'plain';
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

/** Tests and machines without an OS keychain: stored as is (the database is local to the till). */
export const plainCipher: Cipher = { name: 'plain', encrypt: (s) => s, decrypt: (s) => s };

type StoredSecret = { enc: 'safe' | 'plain'; v: string };

const KEY = {
  role: 'lan_role',
  enabled: 'lan_enabled',
  port: 'lan_port',
  lineage: 'lan_lineage',
  link: 'lan_link',
} as const;

async function read(db: LanDb, key: string): Promise<unknown> {
  const row = await db.setting.findUnique({ where: { key } });
  if (!row) return undefined;
  try {
    return JSON.parse(row.value) as unknown;
  } catch {
    return undefined;
  }
}

async function write(db: LanDb, key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  await db.setting.upsert({
    where: { key },
    update: { value: json, updatedAt: new Date() },
    create: { key, value: json },
  });
}

export async function getRole(db: LanDb): Promise<LanRole> {
  return (await read(db, KEY.role)) === 'satellite' ? 'satellite' : 'main';
}

export async function getPort(db: LanDb): Promise<number> {
  const v = await read(db, KEY.port);
  return typeof v === 'number' && Number.isInteger(v) && v >= 1024 && v <= 65535
    ? v
    : DEFAULT_LAN_PORT;
}

export async function setPort(db: LanDb, port: number): Promise<void> {
  await write(db, KEY.port, port);
}

export async function isEnabled(db: LanDb): Promise<boolean> {
  return (await read(db, KEY.enabled)) === true;
}

export async function setEnabled(db: LanDb, enabled: boolean): Promise<void> {
  await write(db, KEY.enabled, enabled);
}

/** The main till's lineage, made on first use. */
export async function ensureLineage(db: LanDb): Promise<string> {
  const v = await read(db, KEY.lineage);
  if (typeof v === 'string' && v) return v;
  const id = randomUUID();
  await write(db, KEY.lineage, id);
  return id;
}

export async function getLink(db: LanDb, cipher: Cipher): Promise<SatelliteLink | null> {
  const v = (await read(db, KEY.link)) as
    | (Omit<SatelliteLink, 'secret'> & { secret: StoredSecret })
    | undefined;
  if (!v || typeof v.mainUrl !== 'string' || typeof v.deviceId !== 'string') return null;
  try {
    const stored = v.secret;
    const secret =
      stored?.enc === 'plain'
        ? stored.v
        : stored?.enc === 'safe' && cipher.name === 'safe'
          ? cipher.decrypt(stored.v)
          : null;
    return secret
      ? { ...v, secret, clinicId: v.clinicId ?? null, clinicName: v.clinicName ?? null }
      : null;
  } catch {
    return null; // the keychain changed: the satellite has to pair again
  }
}

/** The main till's address a satellite had, even when its credential cannot be read. */
export async function getLinkAddress(db: LanDb): Promise<string | null> {
  const v = (await read(db, KEY.link)) as { mainUrl?: unknown } | undefined;
  return typeof v?.mainUrl === 'string' ? v.mainUrl : null;
}

/** Becomes a satellite of `link` (the app restarts afterwards). */
export async function becomeSatellite(
  db: LanDb,
  link: SatelliteLink,
  cipher: Cipher,
): Promise<void> {
  const secret: StoredSecret = { enc: cipher.name, v: cipher.encrypt(link.secret) };
  await write(db, KEY.link, { ...link, secret });
  await write(db, KEY.role, 'satellite');
}

/** Back to a till of its own (it then goes through setup like a new till). */
export async function becomeMain(db: LanDb): Promise<void> {
  await db.setting.deleteMany({ where: { key: KEY.link } });
  await write(db, KEY.role, 'main');
}
