/** Till roles (the same strings the till stores). */
/** STAFF: a till staff type without access (cleaner, guard…): on the list, never signs in. */
export const TILL_ROLES = [
  'CLINIC_ADMIN',
  'SUPER_ADMIN',
  'DOCTOR',
  'RECEPTIONIST',
  'NURSE',
  'STAFF',
] as const;
export type TillRole = (typeof TILL_ROLES)[number];

/** Roles that may sign in to the web dashboard. */
export const ADMIN_ROLES: readonly string[] = ['CLINIC_ADMIN', 'SUPER_ADMIN'];

export const isAdminRole = (role: unknown) =>
  typeof role === 'string' && ADMIN_ROLES.includes(role);
