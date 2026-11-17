import type { ServiceKind } from './clinic';

/**
 * MXIK (IKPU) and package codes for a parasitology clinic's services, from tasnif.soliq.uz
 * (checked 2026-11-16, class 10902 "Медицинские услуги"). Each MXIK has its own package code
 * ("xizmat (marta)"): never use one MXIK's package with another.
 */
export interface FiscalCode {
  mxik: string;
  packageCode: string;
  /** What tasnif calls it (ru), shown next to the code. */
  name: string;
}

export const PARASITOLOGY_FISCAL_CODES: Readonly<Record<'CONSULTATION' | 'ANALYSIS' | 'PROCEDURE', FiscalCode>> = {
  CONSULTATION: {
    mxik: '10902001034000000',
    packageCode: '1321927',
    name: 'Консультация паразитолога',
  },
  ANALYSIS: {
    mxik: '10902002003000999',
    packageCode: '1321964',
    name: 'Лабораторная диагностика, прочие лабораторные исследования',
  },
  PROCEDURE: {
    mxik: '10902003035000000',
    packageCode: '1322001',
    name: 'Услуги паразитолога по лечению и проведению процедур',
  },
};

/** The starter code for a service kind; none for direct sales (goods have their own MXIK). */
export function parasitologyCodeFor(kind: ServiceKind | string): FiscalCode | null {
  return (PARASITOLOGY_FISCAL_CODES as Record<string, FiscalCode | undefined>)[kind] ?? null;
}

export const MXIK_PATTERN = /^\d{17}$/;
export const PACKAGE_CODE_PATTERN = /^\d{1,20}$/;
