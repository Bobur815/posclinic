import { format, parseISO } from 'date-fns';
import { formatPhone } from '@shared/phone';
import i18n from '../i18n';

/** 1 250 000 so'm — UZS has no minor unit on screen. */
export function formatMoney(value: number | null | undefined): string {
  const n = Math.round(Number(value ?? 0));
  const digits = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '−' : ''}${digits} ${i18n.t('common.currency')}`;
}

export function formatNumber(value: number | null | undefined): string {
  return Math.round(Number(value ?? 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local date, dd.MM.yyyy. */
export function formatDate(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? format(d, 'dd.MM.yyyy') : '—';
}

/** Local date and time, dd.MM.yyyy HH:mm. */
export function formatDateTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? format(d, 'dd.MM.yyyy HH:mm') : '—';
}

export function showPhone(phone: string | null | undefined): string {
  return phone ? formatPhone(phone) : '—';
}

/** YYYY-MM-DD of the local calendar day (not UTC). */
export function localDay(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd');
}

/** YYYY-MM of the local month. */
export function localMonth(d: Date = new Date()): string {
  return format(d, 'yyyy-MM');
}

/** Start/end of a local day as ISO instants, for `from`/`to` filters. */
export function dayStartIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}
export function dayEndIso(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}
