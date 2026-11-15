/**
 * Phone numbers are the identity everywhere (staff login, clinic owner, patients). One canonical
 * form, `+998XXXXXXXXX`, so the same person typed three ways is still one person. posgro
 * normalizes the same way.
 */

const UZ_LOCAL = /^(\d{9})$/; // 901234567
const UZ_FULL = /^998(\d{9})$/; // 998901234567

/** `+998XXXXXXXXX`, or null if `raw` is not an Uzbek mobile/landline number. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[\s()+-]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const m = UZ_FULL.exec(digits) ?? UZ_LOCAL.exec(digits);
  return m ? `+998${m[1]}` : null;
}

/** `+998 90 123 45 67` for display; returns the input unchanged if it isn't canonical. */
export function formatPhone(phone: string): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}
