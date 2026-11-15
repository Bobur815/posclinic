import type { ServerErrorCode } from '../../common/errors';
import { isAdminRole } from '../../common/roles';

/**
 * Pure: who may sign in to the web dashboard. Phone is unique per clinic, not globally, so one
 * phone can match staff in several clinics; the password decides which. Same idea as posgro's
 * `dashboardLoginBlockReason`.
 */

export interface LoginCandidate {
  user: { id: string; clinicId: string; role: string; active: boolean; passwordHash: string };
  clinic: { active: boolean; blockAt: Date | null };
}

export type LoginRefusal = Extract<
  ServerErrorCode,
  'invalid_credentials' | 'not_admin' | 'user_inactive' | 'license_blocked'
>;

/** Why this (password-verified) account may not use the dashboard at `now`, or null. */
export function accessRefusal(c: LoginCandidate, now: Date): LoginRefusal | null {
  if (!c.user.active) return 'user_inactive';
  if (!isAdminRole(c.user.role)) return 'not_admin';
  if (!c.clinic.active || (c.clinic.blockAt && c.clinic.blockAt.getTime() <= now.getTime())) {
    return 'license_blocked';
  }
  return null;
}

/** A valid bcrypt hash of a random string: compared when no account matches (equal timing). */
export const DUMMY_HASH = '$2b$10$jyraqJk4iRZo3qPHcxvyjuqIFER1a6sHkWDHMv4bd5zCx66mSO0BC';

export async function pickLogin<C extends LoginCandidate>(
  candidates: C[],
  password: string,
  compare: (password: string, hash: string) => Promise<boolean>,
  now: Date,
): Promise<{ ok: true; candidate: C } | { ok: false; code: LoginRefusal }> {
  if (candidates.length === 0) {
    await compare(password, DUMMY_HASH);
    return { ok: false, code: 'invalid_credentials' };
  }
  let firstRefusal: LoginRefusal | null = null;
  for (const c of candidates) {
    if (!(await compare(password, c.user.passwordHash))) continue;
    const refusal = accessRefusal(c, now);
    if (!refusal) return { ok: true, candidate: c };
    firstRefusal ??= refusal;
  }
  return { ok: false, code: firstRefusal ?? 'invalid_credentials' };
}
