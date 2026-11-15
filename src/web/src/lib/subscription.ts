/** Days until `expiresAt` (negative once past), or null when there is no expiry (unlimited). */
export function daysLeft(expiresAt: string | null | undefined, now = new Date()): number | null {
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - now.getTime()) / 86_400_000);
}

export const EXPIRY_WARN_DAYS = 7;
