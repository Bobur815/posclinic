import type { VitalsDto } from '../../../shared/clinic';

/** Full years from a birth date (ISO), or null. */
export function ageOf(birthDate: string | null | undefined, now = new Date()): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  let age = now.getFullYear() - b.getUTCFullYear();
  const m = now.getMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getUTCDate())) age--;
  return age >= 0 ? age : null;
}

/** Body-mass index from cm / kg, one decimal; null when either is missing. */
export function bmi(v: Pick<VitalsDto, 'heightCm' | 'weightKg'> | null | undefined): number | null {
  if (!v?.heightCm || !v.weightKg) return null;
  const m = v.heightCm / 100;
  return Math.round((v.weightKg / (m * m)) * 10) / 10;
}

/** "172 cm · 68.5 kg · BMI 23.2 · 36.7 °C · 120/80" (the parts that exist). */
export function vitalsLine(v: VitalsDto | null | undefined, t: (k: string) => string): string {
  if (!v) return '—';
  const parts: string[] = [];
  if (v.heightCm) parts.push(`${v.heightCm} ${t('care.cm')}`);
  if (v.weightKg) parts.push(`${v.weightKg} ${t('care.kg')}`);
  const b = bmi(v);
  if (b) parts.push(`${t('care.bmi')} ${b}`);
  if (v.temperature) parts.push(`${v.temperature} °C`);
  if (v.bpSystolic && v.bpDiastolic) parts.push(`${v.bpSystolic}/${v.bpDiastolic}`);
  if (v.pregnant) parts.push(t('care.pregnant'));
  return parts.length ? parts.join(' · ') : '—';
}
