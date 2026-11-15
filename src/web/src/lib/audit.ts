import type { TFunction } from 'i18next';

/**
 * An audit row's `details` as one readable line. The server stores an object (ids and field
 * names only, never patient data): `{ fields: ['price', 'name'] }` for edits, `{ role }` for a
 * new staff member. Rendering the object itself crashed the page (React cannot render objects).
 */
export function formatAuditDetails(details: unknown, t: TFunction): string {
  if (details === null || details === undefined || details === '') return '—';
  if (typeof details === 'string') return details;
  if (typeof details !== 'object') return String(details);

  const parts: string[] = [];
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (key === 'fields' && Array.isArray(value)) {
      if (value.length === 0) continue;
      const names = value.map((f) => t(`audit.fields.${String(f)}`, String(f)));
      parts.push(`${t('audit.changed')}: ${names.join(', ')}`);
    } else if (key === 'role' && typeof value === 'string') {
      parts.push(`${t('audit.role')}: ${t(`roles.${value}`, value)}`);
    } else {
      parts.push(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
    }
  }
  return parts.length ? parts.join(' · ') : '—';
}
