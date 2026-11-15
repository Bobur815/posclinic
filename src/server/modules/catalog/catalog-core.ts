import { isAdminRole } from '../../common/roles';

/**
 * Pure: an admin may not lock themself out of the dashboard (deactivate or demote their own
 * account). Returns true when the patch would do that.
 */
export function isSelfLockout(
  actorId: string,
  targetId: string,
  patch: { active?: boolean; role?: string },
): boolean {
  if (actorId !== targetId) return false;
  if (patch.active === false) return true;
  return patch.role !== undefined && !isAdminRole(patch.role);
}

/** Field names present in a patch (for the audit log: names only, no values). */
export const changedFields = (patch: object) =>
  Object.entries(patch)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);

/** `null` / '' → null, otherwise the trimmed string; `undefined` stays undefined (no change). */
export function nullable(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}
