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

// ── The "+998" phone field (till and web PhoneInput) ──────────────────────────────────────

/** The 9 local digits in any typed or stored form ("+998 90…", "99890…", "90 123…"), at most 9. */
export function phoneLocalDigits(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  // "+998…" always carries the country code, however short (a field's own partial value is
  // "+9989" after one digit). Without the "+", a leading 998 is the code only when there are
  // more than 9 digits: "99 123 45 67" and "98 …" are real local numbers.
  if (v.startsWith('+')) {
    const d = v.replace(/\D/g, '');
    return (d.startsWith('998') ? d.slice(3) : d).slice(0, 9);
  }
  let d = v.replace(/\D/g, '');
  if (d.length > 9 && d.startsWith('998')) d = d.slice(3);
  return d.slice(0, 9);
}

/** "90 123 45 67" (as much as is typed). */
export function formatPhoneLocal(value: string | null | undefined): string {
  const d = phoneLocalDigits(value);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}

/**
 * What a phone field hands its form: `+998` + the digits typed, or '' when empty. Partial
 * numbers stay partial (`+99890`), so the server's `normalizePhone` still refuses them.
 */
export function phoneFieldValue(value: string | null | undefined): string {
  const d = phoneLocalDigits(value);
  return d ? `+998${d}` : '';
}

/** All 9 digits are there. */
export function isCompletePhone(value: string | null | undefined): boolean {
  return phoneLocalDigits(value).length === 9;
}

/** `+998 90 123 45 67` for display; returns the input unchanged if it isn't canonical. */
export function formatPhone(phone: string): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : phone;
}
