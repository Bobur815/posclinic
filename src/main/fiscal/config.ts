import { randomBytes } from 'node:crypto';
import type { FiscalConfigDto, FiscalConfigInput } from '../../shared/clinic';
import { MXIK_PATTERN, PACKAGE_CODE_PATTERN, parasitologyCodeFor } from '../../shared/fiscal-codes';
import {
  FISCAL_KINDS,
  FISCAL_VAT_MODES,
  type FiscalCodePair,
  type FiscalCodes,
  type FiscalKind,
  type FiscalVatMode,
} from '../../shared/fiscal-receipt';
import { RefusedError } from '../ipc/ipc-safe';
import type { Cipher } from '../lan/config';

/**
 * v2.6: the fiscal receipt settings (SavdoChef's fiscal/config.ts), JSON values in `settings`
 * (keys `fiscal_*`; never synced). The VCR password is stored encrypted with this machine's key
 * (Electron safeStorage, as the LAN secret) and never leaves main: the renderer sees `hasPassword`.
 */

export const DEFAULT_VCR_PORT = 22298;

const KEY = {
  enabled: 'fiscal_enabled',
  host: 'fiscal_vcr_host',
  port: 'fiscal_vcr_port',
  login: 'fiscal_vcr_login',
  password: 'fiscal_vcr_password',
  vatMode: 'fiscal_vat_mode',
  codes: 'fiscal_codes_by_kind',
  codePrefix: 'fiscal_code_prefix',
} as const;

// biome-ignore lint/suspicious/noExplicitAny: the generated client or a transaction
type Db = any;

type StoredSecret = { enc: Cipher['name']; v: string };

export interface ResolvedFiscalConfig {
  enabled: boolean;
  host: string;
  port: number;
  login: string;
  /** '' when none is saved or it cannot be decrypted on this machine. */
  password: string;
  codes: FiscalCodes;
}

/**
 * Where REGOS:VCR answers: this PC or another one in the clinic's network, plain http (VCR
 * serves nothing else). Canonical decimal octets only: the URL parser reads "010" as octal and
 * "0x7f" as hex, so "010.8.8.8" would pass as 10.x and connect to 8.8.8.8 (SavdoChef review).
 */
export function isAllowedVcrHost(host: string): boolean {
  if (host === 'localhost') return true;
  const octet = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
  const m = new RegExp(`^${octet}\\.${octet}\\.${octet}\\.${octet}$`).exec(host);
  if (!m) return false;
  const [a, b] = m.slice(1).map(Number) as [number, number];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/** The starter defaults: the parasitology codes for the three clinical kinds, none for goods. */
function defaultCodes(): Record<FiscalKind, FiscalCodePair> {
  const out = {} as Record<FiscalKind, FiscalCodePair>;
  for (const k of FISCAL_KINDS) {
    const c = parasitologyCodeFor(k);
    out[k] = { mxik: c?.mxik ?? '', packageCode: c?.packageCode ?? '' };
  }
  return out;
}

async function readAll(db: Db): Promise<Map<string, unknown>> {
  const rows: Array<{ key: string; value: string }> = await db.setting.findMany({
    where: { key: { startsWith: 'fiscal_' } },
  });
  const out = new Map<string, unknown>();
  for (const r of rows) {
    try {
      out.set(r.key, JSON.parse(r.value));
    } catch {
      // A broken value reads as its default.
    }
  }
  return out;
}

const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

function decryptSecret(v: unknown, cipher: Cipher): string {
  const s = v as StoredSecret | undefined;
  if (!s || typeof s.v !== 'string' || !s.v) return '';
  // Written in clear only on a machine without an OS keychain; read back only there.
  if (s.enc === 'plain') return cipher.name === 'plain' ? s.v : '';
  try {
    return cipher.name === s.enc ? cipher.decrypt(s.v) : '';
  } catch {
    return '';
  }
}

function readCodes(v: unknown): Record<FiscalKind, FiscalCodePair> {
  const out = defaultCodes();
  if (!v || typeof v !== 'object') return out;
  for (const k of FISCAL_KINDS) {
    const p = (v as Record<string, { mxik?: unknown; packageCode?: unknown }>)[k];
    if (p && typeof p === 'object') {
      out[k] = { mxik: str(p.mxik, ''), packageCode: str(p.packageCode, '') };
    }
  }
  return out;
}

/** Only the on/off switch: what the payment transaction asks. */
export async function fiscalEnabled(db: Db): Promise<boolean> {
  const row = await db.setting.findUnique({ where: { key: KEY.enabled } });
  return row?.value === 'true';
}

export async function resolveFiscalConfig(db: Db, cipher: Cipher): Promise<ResolvedFiscalConfig> {
  const m = await readAll(db);
  const vat = m.get(KEY.vatMode);
  const port = m.get(KEY.port);
  return {
    enabled: m.get(KEY.enabled) === true,
    host: str(m.get(KEY.host), '127.0.0.1'),
    port:
      typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535
        ? port
        : DEFAULT_VCR_PORT,
    login: str(m.get(KEY.login), 'cassir'),
    password: decryptSecret(m.get(KEY.password), cipher),
    codes: {
      vatMode: FISCAL_VAT_MODES.includes(vat as FiscalVatMode)
        ? (vat as FiscalVatMode)
        : 'nonPayer',
      byKind: readCodes(m.get(KEY.codes)),
    },
  };
}

export function toFiscalConfigDto(c: ResolvedFiscalConfig, urlOverride: boolean): FiscalConfigDto {
  return {
    enabled: c.enabled,
    host: c.host,
    port: c.port,
    login: c.login,
    hasPassword: c.password !== '',
    vatMode: c.codes.vatMode,
    codes: c.codes.byKind,
    urlOverride,
  };
}

/** The settings form as sent, checked; `errors.invalidSetting` / code errors on anything off. */
export function parseFiscalConfig(raw: unknown): FiscalConfigInput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const bad = () => new RefusedError('errors.invalidSetting');
  const host = typeof r.host === 'string' ? r.host.trim() : '';
  if (!isAllowedVcrHost(host)) throw new RefusedError('errors.invalidVcrHost');
  const port = Number(r.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw bad();
  const login = typeof r.login === 'string' ? r.login.trim() : '';
  if (!login || login.length > 40) throw bad();
  if (r.password !== undefined && (typeof r.password !== 'string' || r.password.length > 100)) {
    throw bad();
  }
  if (!FISCAL_VAT_MODES.includes(r.vatMode as FiscalVatMode)) throw bad();
  const codes = {} as Record<FiscalKind, FiscalCodePair>;
  const given = (r.codes ?? {}) as Record<string, { mxik?: unknown; packageCode?: unknown }>;
  for (const k of FISCAL_KINDS) {
    const mxik = typeof given[k]?.mxik === 'string' ? (given[k]!.mxik as string).trim() : '';
    const pkg =
      typeof given[k]?.packageCode === 'string' ? (given[k]!.packageCode as string).trim() : '';
    if (mxik && !MXIK_PATTERN.test(mxik)) throw new RefusedError('errors.invalidMxik');
    if (pkg && !PACKAGE_CODE_PATTERN.test(pkg)) throw new RefusedError('errors.invalidPackageCode');
    codes[k] = { mxik, packageCode: mxik ? pkg : '' };
  }
  return {
    enabled: r.enabled === true,
    host,
    port,
    login,
    password: typeof r.password === 'string' ? r.password : undefined,
    vatMode: r.vatMode as FiscalVatMode,
    codes,
  };
}

async function put(db: Db, key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  await db.setting.upsert({
    where: { key },
    update: { value: json },
    create: { key, value: json },
  });
}

export async function saveFiscalConfig(
  db: Db,
  cipher: Cipher,
  input: FiscalConfigInput,
): Promise<void> {
  // The saved password goes only to the VCR it was given for: pointing host, port or login
  // elsewhere needs it typed again (else an admin could send it to their own machine by "Test").
  const before = await resolveFiscalConfig(db, cipher);
  const moved =
    before.host !== input.host || before.port !== input.port || before.login !== input.login;
  if (moved && before.password && !input.password) {
    throw new RefusedError('errors.fiscalPasswordRequired');
  }
  await put(db, KEY.enabled, input.enabled);
  await put(db, KEY.host, input.host);
  await put(db, KEY.port, input.port);
  await put(db, KEY.login, input.login);
  await put(db, KEY.vatMode, input.vatMode);
  await put(db, KEY.codes, input.codes);
  // Empty keeps the saved password.
  if (input.password) {
    const secret: StoredSecret = { enc: cipher.name, v: cipher.encrypt(input.password) };
    await put(db, KEY.password, secret);
  }
}

/**
 * The prefix of every receipt `code` this database sends (VCR's idempotency key), made on first
 * use. Visit numbers start again on a fresh install; with the same prefix a new visit could be
 * taken for a receipt VCR already holds from the old database.
 */
export async function receiptCodePrefix(db: Db): Promise<string> {
  const row = await db.setting.findUnique({ where: { key: KEY.codePrefix } });
  if (row) {
    try {
      const v = JSON.parse(row.value) as unknown;
      if (typeof v === 'string' && /^[a-f0-9]{8}$/.test(v)) return v;
    } catch {
      // made again below
    }
  }
  // Created, never updated: two first callers must not end up with two prefixes.
  const made = randomBytes(4).toString('hex');
  try {
    await db.setting.create({ data: { key: KEY.codePrefix, value: JSON.stringify(made) } });
    return made;
  } catch (e) {
    if ((e as { code?: string })?.code !== 'P2002') throw e;
    return receiptCodePrefix(db);
  }
}

export const receiptCode = (prefix: string, appointmentNumber: string) =>
  `PC-${prefix}-${appointmentNumber}`;
