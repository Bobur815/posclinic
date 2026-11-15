import { createPublicKey, type KeyObject, verify } from 'node:crypto';

/**
 * Pure: verifying a posgro POSCLINIC licence token on the server. Same token format and checks
 * as the till's `readLicense` (`src/main/license/license-core.ts`); contract:
 * `.claude/rules/licensing.md` and `.claude/rules/server-api.md`. No Nest, no database.
 */

/** The till's compiled-in key (`src/main/license/license-public-key.ts`). */
export const DEFAULT_LICENSE_PUBLIC_KEY =
  'MCowBQYDK2VwAyEAa8xFceic2BIzN7AzSY5IpFWWBXq4pDm0QmB9xiELlgU=';

export interface ServerLicensePayload {
  v: 1;
  product: 'POSCLINIC';
  storeId: string;
  storeName: string;
  plan: string | null;
  expiresAt: string | null;
  warnFrom: string | null;
  blockAt: string | null;
  issuedAt: string;
  checkinBy: string;
  terminals?: number;
  seats?: string[];
  features: string[];
  limits: { staff: number | null; monthlyVisits: number | null };
  trialEndsAt?: string;
}

export function publicKeyFrom(base64Der: string): KeyObject {
  return createPublicKey({ key: Buffer.from(base64Der, 'base64'), format: 'der', type: 'spki' });
}

const isDate = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isDateOrNull = (v: unknown) => v === null || isDate(v);
const isLimit = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'number' && Number.isInteger(v) && v >= 0);

/** The payload of `<payload>.<sig>` signed by `key` for POSCLINIC, or null. */
export function readLicense(token: unknown, key: KeyObject): ServerLicensePayload | null {
  if (typeof token !== 'string') return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  try {
    const bytes = Buffer.from(body, 'base64url');
    if (!verify(null, bytes, key, Buffer.from(sig, 'base64url'))) return null;
    const p = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;
    const limits = (p.limits ?? {}) as Record<string, unknown>;
    const ok =
      p.v === 1 &&
      p.product === 'POSCLINIC' &&
      typeof p.storeId === 'string' &&
      /^[A-Za-z0-9_-]{1,64}$/.test(p.storeId) &&
      typeof p.storeName === 'string' &&
      (p.plan === null || typeof p.plan === 'string') &&
      isDateOrNull(p.expiresAt) &&
      isDateOrNull(p.warnFrom) &&
      isDateOrNull(p.blockAt) &&
      isDate(p.issuedAt) &&
      isDate(p.checkinBy) &&
      Array.isArray(p.features) &&
      typeof limits === 'object' &&
      isLimit(limits.staff) &&
      isLimit(limits.monthlyVisits) &&
      (p.seats === undefined ||
        (Array.isArray(p.seats) && p.seats.every((s) => typeof s === 'string')));
    if (!ok) return null;
    return {
      ...(p as unknown as ServerLicensePayload),
      features: (p.features as unknown[]).filter((f): f is string => typeof f === 'string'),
      limits: {
        staff: (limits.staff as number | null | undefined) ?? null,
        monthlyVisits: (limits.monthlyVisits as number | null | undefined) ?? null,
      },
    };
  } catch {
    return null;
  }
}

export type LicenseCheck =
  | { ok: true; license: ServerLicensePayload }
  | { ok: false; code: 'invalid_license' | 'license_blocked' | 'license_checkin_required' };

/**
 * Whether a till may sync with `token` at `now`. Blocked outranks an overdue check-in (as on the
 * till). An overdue `checkinBy` means posgro has not renewed this token: it may be one posgro
 * has since revoked, so it is not accepted either.
 */
export function checkLicense(token: unknown, key: KeyObject, now: number): LicenseCheck {
  const license = readLicense(token, key);
  if (!license) return { ok: false, code: 'invalid_license' };
  if (license.blockAt && now >= Date.parse(license.blockAt)) {
    return { ok: false, code: 'license_blocked' };
  }
  if (now >= Date.parse(license.checkinBy)) return { ok: false, code: 'license_checkin_required' };
  return { ok: true, license };
}

/** The token from `Authorization: License <token>`, or null. */
export function licenseTokenFrom(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const m = /^License\s+(\S+)$/.exec(header.trim());
  return m ? m[1] : null;
}
