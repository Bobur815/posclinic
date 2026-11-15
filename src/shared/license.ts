/**
 * What the posgro server's licence lets this till do. Shared by main (which enforces it) and the
 * renderer (which only explains it). The server's copy is posgro
 * `src/server/modules/posclinic/posclinic-config.ts`; the contract is `.claude/rules/licensing.md`.
 * Keep the names in step on both sides.
 */

export const LICENSE_FEATURES = [
  'reports',
  'multiDoctor',
  'printPrescription',
  'debt',
  // Sold in plans already, nothing on this till uses them yet.
  'labResults',
  'telegramBot',
] as const;
export type LicenseFeature = (typeof LICENSE_FEATURES)[number];

/** In a plan already, not built on the till yet: shown as "coming soon". */
export const UPCOMING_FEATURES: readonly LicenseFeature[] = ['labResults', 'telegramBot'];

export const LICENSE_PLANS = ['TRIAL', 'START', 'PRO', 'ENTERPRISE', 'VIP'] as const;
export type LicensePlan = (typeof LICENSE_PLANS)[number];

export function knownPlan(raw: unknown): LicensePlan | null {
  return (LICENSE_PLANS as readonly unknown[]).includes(raw) ? (raw as LicensePlan) : null;
}

/** `null` = unlimited. */
export interface LicenseLimits {
  staff: number | null;
  monthlyVisits: number | null;
}

export const UNLIMITED: LicenseLimits = { staff: null, monthlyVisits: null };

/**
 * - `full`: everything the plan includes;
 * - `readonly`: existing visits can still be paid and viewed, no new patients/visits/doctors;
 * - `setup`: not linked to a clinic yet (only the setup wizard works).
 */
export type TillMode = 'full' | 'readonly' | 'setup';

export type LicenseReason =
  | 'active'
  | 'trial'
  | 'warning'
  | 'grace'
  | 'unlimited'
  | 'blocked'
  | 'checkin-required'
  | 'no-seat'
  | 'setup';

export interface LicenseStatusDto {
  mode: TillMode;
  reason: LicenseReason;
  linked: boolean;
  storeId: string | null;
  storeName: string | null;
  plan: LicensePlan | null;
  features: LicenseFeature[];
  limits: LicenseLimits;
  /** Days until the next cut-off (expiry or block). */
  daysLeft: number | null;
  expiresAt: string | null;
  trialEndsAt: string | null;
  lastCheckinAt: string | null;
  /** The till must reach the server by then. */
  checkinBy: string | null;
  terminalId: string;
  /** i18n key from the last failed check-in. */
  lastError: string | null;
}

/** What `license:activate` answers the setup wizard. */
export type ActivateResult =
  | {
      ok: true;
      storeId: string;
      storeName: string;
      ownerName: string | null;
      /** A set-up till re-linked after losing its licence file: skip step 2. */
      recovered?: boolean;
    }
  | { ok: false; error: string };
