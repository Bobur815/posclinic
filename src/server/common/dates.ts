import { BadRequestException } from '@nestjs/common';
import { errorKey } from './errors';

/** Clinics are in Uzbekistan: UTC+5 all year (no DST). Days and months are counted there. */
export const CLINIC_UTC_OFFSET = '+05:00';
const OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of `at` in clinic time. */
export function clinicDay(at: Date): string {
  return new Date(at.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** [start, end) of a clinic-local day; `date` defaults to today. */
export function dayRange(date?: string, now = new Date()): { from: Date; to: Date; day: string } {
  const day = date && date.length > 0 ? date : clinicDay(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new BadRequestException(errorKey('invalid_date'));
  const from = new Date(`${day}T00:00:00${CLINIC_UTC_OFFSET}`);
  if (Number.isNaN(from.getTime())) throw new BadRequestException(errorKey('invalid_date'));
  return { from, to: new Date(from.getTime() + DAY_MS), day };
}

/** [start, end) of a clinic-local month `YYYY-MM`; defaults to this month. */
export function monthRange(month?: string, now = new Date()): { from: Date; to: Date } {
  const m = month && month.length > 0 ? month : clinicDay(now).slice(0, 7);
  const match = /^(\d{4})-(\d{2})$/.exec(m);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new BadRequestException(errorKey('invalid_date'));
  }
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  return {
    from: new Date(`${m}-01T00:00:00${CLINIC_UTC_OFFSET}`),
    to: new Date(`${next}-01T00:00:00${CLINIC_UTC_OFFSET}`),
  };
}

/** A parsed ISO date, or undefined when empty; 400 when malformed. */
export function optionalDate(raw?: string): Date | undefined {
  if (raw === undefined || raw === '') return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(errorKey('invalid_date'));
  return d;
}

export function paging(page?: number, pageSize?: number) {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const size = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 20)));
  return { skip: (p - 1) * size, take: size };
}
