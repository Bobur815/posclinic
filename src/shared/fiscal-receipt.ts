import { MXIK_PATTERN } from './fiscal-codes';

/**
 * v2.6: a paid visit as REGOS:VCR's Receipt.Sale wants it (SavdoChef's
 * shared/utils/fiscal-receipt.ts, posgro's REGOS_VCR_INTEGRATION.md). Pure and Electron-free, so
 * the money rules are pinned by tests:
 *
 * - money in tiyin (so'm x 100) and quantities x 1000, integers;
 * - one position per paid line: `amount` = unit price x quantity, `discount` = the line's discount
 *   (a course paid upfront), so amount - discount = the line total (posgro: VCR takes the paid
 *   value as amount - discount);
 * - MXIK / package from the service, else the kind's default from settings; a package always
 *   goes with its own MXIK (a service's own MXIK uses only its own package code);
 * - VAT: medical services are VAT-exempt (Tax Code art. 243): "Без НДС" = -1 by default; a 12 %
 *   payer sends ceil(net x 12 / 112) (VCR re-derives the rate and truncates: rounding down lands
 *   on 11 % and is refused, posgro gotcha);
 * - payments: CASH -> type 1, CARD -> type 2 with card_type 2 (a plain bank terminal). A visit
 *   paid partly by TRANSFER or INSURANCE is not fiscalised at all (owner decision 2026-11-16):
 *   positions must equal the payments.
 */

export type FiscalVatMode = 'nonPayer' | 'vat12';
export const FISCAL_VAT_MODES: readonly FiscalVatMode[] = ['nonPayer', 'vat12'];

export type FiscalKind = 'CONSULTATION' | 'ANALYSIS' | 'PROCEDURE' | 'DIRECT_SALE';
export const FISCAL_KINDS: readonly FiscalKind[] = [
  'CONSULTATION',
  'ANALYSIS',
  'PROCEDURE',
  'DIRECT_SALE',
];

export interface FiscalCodePair {
  mxik: string;
  packageCode: string;
}

export interface FiscalCodes {
  vatMode: FiscalVatMode;
  /** The default per service kind; '' = none (a service of that kind needs its own). */
  byKind: Record<FiscalKind, FiscalCodePair>;
}

export interface VcrPosition {
  name: string;
  barcode: string;
  /** MXIK (IKPU), 17 digits. */
  icps: string;
  package_code?: string;
  /** Tiyin, before the discount. */
  amount: number;
  /** x 1000. */
  quantity: number;
  /** Tiyin, or -1 for "Без НДС". */
  vat_value: number;
  /** Tiyin. */
  discount: number;
  owner_type: 'BuyingAndSelling';
}

export interface VcrPayment {
  type: 1 | 2;
  /** Tiyin. */
  value: number;
  card_type?: 2;
}

export interface FiscalVisitInput {
  lines: Array<{
    serviceId: string;
    name: string;
    kind: string;
    mxik: string | null;
    packageCode: string | null;
    quantity: number;
    unitPrice: number;
    discount: number;
    total: number;
  }>;
  payments: Array<{ method: string; amount: number }>;
}

export type FiscalReceiptProblem =
  | { reason: 'NO_MXIK'; name: string }
  | { reason: 'EMPTY' }
  | { reason: 'NOT_FISCAL_PAYMENT'; method: string }
  | { reason: 'LINE_TOTAL'; name: string }
  | { reason: 'UNBALANCED'; positions: number; payments: number };

export class FiscalReceiptError extends Error {
  constructor(readonly problem: FiscalReceiptProblem) {
    super(problemText(problem));
    this.name = 'FiscalReceiptError';
  }
}

function problemText(p: FiscalReceiptProblem): string {
  switch (p.reason) {
    case 'NO_MXIK':
      return `MXIK kodi kiritilmagan: ${p.name}`;
    case 'EMPTY':
      return "Chekda pozitsiya yo'q";
    case 'NOT_FISCAL_PAYMENT':
      return `To'lov usuli fiskal chekka kirmaydi: ${p.method}`;
    case 'LINE_TOTAL':
      return `Xizmat summasi narx x soni - chegirmaga teng emas: ${p.name}`;
    case 'UNBALANCED':
      return "Chek summasi to'lovlarga teng emas";
  }
}

/** So'm -> tiyin, exactly for amounts with at most 2 decimals. */
export function toTiyin(value: number): number {
  return Math.round(Number(value) * 100);
}

/** Quantity x 1000 (VCR's unit), at least 1. */
export function toMilli(value: number): number {
  return Math.max(1, Math.round(Number(value) * 1000));
}

export function vatValue(netTiyin: number, mode: FiscalVatMode): number {
  if (mode === 'nonPayer') return -1;
  // Integer math: ceil(net * 12 / 112) without float error.
  return Math.floor((netTiyin * 12 + 111) / 112);
}

/** A stable 8-digit "barcode" for a service (VCR wants one; services have none). FNV-1a. */
export function serviceBarcode(serviceId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < serviceId.length; i++) {
    h ^= serviceId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return String(h % 100_000_000).padStart(8, '0');
}

const FISCAL_METHODS = new Set(['CASH', 'CARD']);

/** The payment methods of a visit that keep it off the fiscal receipt (TRANSFER, INSURANCE…). */
export function nonFiscalMethod(payments: Array<{ method: string }>): string | null {
  return payments.find((p) => !FISCAL_METHODS.has(p.method))?.method ?? null;
}

function codesFor(
  line: FiscalVisitInput['lines'][number],
  codes: FiscalCodes,
): FiscalCodePair | null {
  const own = line.mxik?.trim();
  if (own) return { mxik: own, packageCode: (line.packageCode ?? '').trim() };
  const d = (codes.byKind as Record<string, FiscalCodePair | undefined>)[line.kind];
  if (!d || !d.mxik.trim()) return null;
  return { mxik: d.mxik.trim(), packageCode: d.packageCode.trim() };
}

/** The Receipt.Sale positions and payments of a paid visit. Throws FiscalReceiptError. */
export function buildFiscalReceipt(
  visit: FiscalVisitInput,
  codes: FiscalCodes,
): { positions: VcrPosition[]; payments: VcrPayment[] } {
  const odd = nonFiscalMethod(visit.payments);
  if (odd) throw new FiscalReceiptError({ reason: 'NOT_FISCAL_PAYMENT', method: odd });

  const positions: VcrPosition[] = [];
  for (const line of visit.lines) {
    const total = toTiyin(line.total);
    if (total <= 0) continue; // free (a follow-up) or fully discounted: nothing paid for it
    const pair = codesFor(line, codes);
    if (!pair || !MXIK_PATTERN.test(pair.mxik)) {
      throw new FiscalReceiptError({ reason: 'NO_MXIK', name: line.name });
    }
    const amount = toTiyin(line.unitPrice * line.quantity);
    const discount = toTiyin(line.discount);
    if (amount - discount !== total) {
      throw new FiscalReceiptError({ reason: 'LINE_TOTAL', name: line.name });
    }
    const p: VcrPosition = {
      name: line.name.slice(0, 120),
      barcode: serviceBarcode(line.serviceId),
      icps: pair.mxik,
      amount,
      quantity: toMilli(line.quantity),
      vat_value: vatValue(total, codes.vatMode),
      discount,
      owner_type: 'BuyingAndSelling',
    };
    if (pair.packageCode) p.package_code = pair.packageCode;
    positions.push(p);
  }
  if (positions.length === 0) throw new FiscalReceiptError({ reason: 'EMPTY' });

  const sum = (m: string) =>
    visit.payments.filter((p) => p.method === m).reduce((s, p) => s + toTiyin(p.amount), 0);
  const cash = sum('CASH');
  const card = sum('CARD');
  const payments: VcrPayment[] = [];
  if (cash > 0) payments.push({ type: 1, value: cash });
  if (card > 0) payments.push({ type: 2, value: card, card_type: 2 });

  const posTotal = positions.reduce((s, p) => s + p.amount - p.discount, 0);
  const payTotal = payments.reduce((s, p) => s + p.value, 0);
  if (posTotal !== payTotal) {
    throw new FiscalReceiptError({ reason: 'UNBALANCED', positions: posTotal, payments: payTotal });
  }
  return { positions, payments };
}
