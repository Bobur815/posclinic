import { createPublicKey, type KeyObject, verify } from 'node:crypto';
import {
  knownPlan,
  LICENSE_FEATURES,
  type LicenseFeature,
  type LicenseLimits,
  type LicensePlan,
  type LicenseReason,
  type TillMode,
} from '../../shared/license';

/**
 * Pure: reading the posgro licence and deciding what this till may do. No Electron, no database;
 * `now` comes from the trusted clock. Ported from SavdoChef `src/main/license/license-core.ts`.
 * Contract: `.claude/rules/licensing.md`.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** What posgro signs (`src/server/modules/posclinic/posclinic-license.ts`). */
export interface LicensePayload {
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
  features: LicenseFeature[];
  limits: LicenseLimits;
  trialEndsAt?: string;
}

export function publicKeyFrom(base64Der: string): KeyObject {
  return createPublicKey({
    key: Buffer.from(base64Der, 'base64'),
    format: 'der',
    type: 'spki',
  });
}

const isDate = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isDateOrNull = (v: unknown) => v === null || isDate(v);
const isLimit = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'number' && Number.isInteger(v) && v >= 0);

/** The payload of `<payload>.<sig>` signed by `key` for POSCLINIC, or null. */
export function readLicense(token: unknown, key: KeyObject): LicensePayload | null {
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
      // The id names the clinic's DB file (clinic-<id>.db): keep it a plain token.
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
      ...(p as unknown as LicensePayload),
      // Only names this build knows; an unknown one switches nothing on.
      features: LICENSE_FEATURES.filter((f) => (p.features as unknown[]).includes(f)),
      limits: {
        staff: (limits.staff as number | null | undefined) ?? null,
        monthlyVisits: (limits.monthlyVisits as number | null | undefined) ?? null,
      },
    };
  } catch {
    return null;
  }
}

export interface TillState {
  mode: TillMode;
  reason: LicenseReason;
  features: LicenseFeature[];
  limits: LicenseLimits;
  daysLeft: number | null;
  plan: LicensePlan | null;
}

/**
 * Where this till stands at `now` (trusted clock). No licence = setup: posclinic has no
 * pre-licensing installs, so there is no unlinked allowance. Blocked outranks an overdue check-in.
 */
export function tillState(input: {
  license: LicensePayload | null;
  terminalId: string;
  now: number;
}): TillState {
  const { license, now } = input;
  const daysUntil = (ms: number) => Math.max(0, Math.ceil((ms - now) / DAY_MS));

  if (!license) {
    return {
      mode: 'setup',
      reason: 'setup',
      features: [],
      limits: { staff: 0, monthlyVisits: 0 },
      daysLeft: null,
      plan: null,
    };
  }

  const at = Date.parse;
  const plan = knownPlan(license.plan);
  const base = { features: license.features, limits: license.limits, plan };
  if (license.blockAt && now >= at(license.blockAt)) {
    return { ...base, mode: 'readonly', reason: 'blocked', daysLeft: 0 };
  }
  if (now >= at(license.checkinBy)) {
    return {
      ...base,
      mode: 'readonly',
      reason: 'checkin-required',
      daysLeft: 0,
    };
  }
  if (license.seats && !license.seats.includes(input.terminalId)) {
    return { ...base, mode: 'readonly', reason: 'no-seat', daysLeft: null };
  }
  const { expiresAt, warnFrom, blockAt } = license;
  if (!expiresAt || !warnFrom || !blockAt) {
    return { ...base, mode: 'full', reason: 'unlimited', daysLeft: null };
  }
  if (now < at(warnFrom)) {
    return {
      ...base,
      mode: 'full',
      reason: plan === 'TRIAL' ? 'trial' : 'active',
      daysLeft: daysUntil(at(expiresAt)),
    };
  }
  if (now < at(expiresAt)) {
    return {
      ...base,
      mode: 'full',
      reason: 'warning',
      daysLeft: daysUntil(at(expiresAt)),
    };
  }
  return {
    ...base,
    mode: 'full',
    reason: 'grace',
    daysLeft: daysUntil(at(blockAt)),
  };
}

// ── What the till refuses ──────────────────────────────────────────────────────────────────

/**
 * New business: refused while read-only. Viewing, paying an existing visit, printing a receipt
 * and reports stay open (a clinic blocked mid-day must still collect money and see its records).
 */
export const READONLY_REFUSED: ReadonlySet<string> = new Set([
  'patients:create',
  'patients:update',
  'doctors:create',
  'doctors:update',
  'services:create',
  'services:update',
  'appointments:create',
  'appointments:update',
  // v2.5 clinical workflow: new referrals and new staff logins are new business.
  'cases:addReferral',
  'doctors:createLogin',
]);

/** Answers from the database the gate needs; injected so this file stays pure. */
export interface GateFacts {
  activeDoctors(excludeId?: string): Promise<number>;
  /** Active staff logins (the plan's `staff` limit). */
  activeUsers(): Promise<number>;
  visitsThisMonth(): Promise<number>;
  /** What a visit costs and what has been paid on it so far; null if there is no such visit. */
  appointmentBalance(id: string): Promise<{ total: number; paid: number } | null>;
}

/** i18n keys (`license.refused.*`), resolved in the renderer. */
export type Refusal =
  | `license.refused.${'setup' | 'blocked' | 'checkin-required' | 'no-seat' | 'invalid'}`
  | `license.feature.${LicenseFeature}`
  | 'license.limit.monthlyVisits'
  | 'license.limit.staff';

const REPORT_RANGE_FREE_MS = DAY_MS;

/** The feature or limit a call needs given its args; null when it needs none. */
async function needed(
  channel: string,
  args: unknown[],
  state: TillState,
  facts: GateFacts,
): Promise<Refusal | null> {
  const has = (f: LicenseFeature) => state.features.includes(f);
  const arg = (i: number) => (args[i] ?? {}) as Record<string, unknown>;

  switch (channel) {
    case 'appointments:create': {
      // Only a registration that opens a new case is a new visit; one inside an open case is not.
      if (arg(0).caseId) return null;
      const max = state.limits.monthlyVisits;
      if (max !== null && (await facts.visitsThisMonth()) >= max) {
        return 'license.limit.monthlyVisits';
      }
      return null;
    }
    case 'appointments:checkout': {
      // Money only moves through checkout (appointments:update cannot set it), so this is the
      // one place a partial payment can happen. `amount` is the money taken NOW (it may exceed
      // what is owed: cash with change); a non-number or nothing is never a payment.
      const amount = arg(1).amount;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return 'license.refused.invalid';
      }
      if (has('debt')) return null;
      const balance = await facts.appointmentBalance(String(args[0] ?? ''));
      // Leaving any of the bill unpaid is selling on debt.
      return balance !== null && balance.paid + amount < balance.total
        ? 'license.feature.debt'
        : null;
    }
    case 'appointments:getAll': {
      // The work list (no dates, `today`, one `date`) is free; a date range is a report, free
      // only up to one day. A range with one open end is unbounded.
      if (has('reports')) return null;
      const { startDate, endDate } = arg(0);
      if (startDate === undefined && endDate === undefined) return null;
      const span = Date.parse(String(endDate)) - Date.parse(String(startDate));
      return Number.isFinite(span) && span <= REPORT_RANGE_FREE_MS
        ? null
        : 'license.feature.reports';
    }
    case 'doctors:create':
      return !has('multiDoctor') && (await facts.activeDoctors()) >= 1
        ? 'license.feature.multiDoctor'
        : null;
    case 'doctors:update':
      // Switching a second doctor back on is a second doctor too.
      if (has('multiDoctor') || arg(1).active !== true) return null;
      return (await facts.activeDoctors(String(args[0] ?? ''))) >= 1
        ? 'license.feature.multiDoctor'
        : null;
    case 'doctors:createLogin': {
      const max = state.limits.staff;
      return max !== null && (await facts.activeUsers()) >= max ? 'license.limit.staff' : null;
    }
    case 'print:prescription':
      return has('printPrescription') ? null : 'license.feature.printPrescription';
    default:
      return null;
  }
}

/**
 * The reason a call is refused at `state`, or null to let it through. Checked in main on every
 * gated call (`ipc/ipc-safe.ts`); hiding a button in the renderer is only a courtesy.
 */
export async function refusal(
  channel: string,
  args: unknown[],
  state: TillState,
  facts: GateFacts,
): Promise<Refusal | null> {
  if (state.mode === 'setup') return 'license.refused.setup';
  if (state.mode === 'readonly' && READONLY_REFUSED.has(channel)) {
    return `license.refused.${state.reason as 'blocked' | 'checkin-required' | 'no-seat'}`;
  }
  return needed(channel, args, state, facts);
}
