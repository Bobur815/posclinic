import type { ServiceKind } from '../../shared/clinic';

/**
 * What a registration costs, line by line. Pure: the handler (register-order.ts) loads the
 * catalog, referrals and case facts in its transaction and passes them in. Prices always come
 * from the till's catalog, never from the caller.
 *
 * Rules (owner, 2026-11-15):
 * - a consultation needs a doctor; any other line has none;
 * - a follow-up consultation is free within `followUpFreeDays` of a paid consultation in the case;
 * - a discount is only for a course paid in full upfront (a procedure of 2+ sessions that covers
 *   the whole remaining referral), up to `maxDiscountPercent` unless an admin approved more;
 * - a referral line can register at most what is left of the referral.
 */

export class PricingError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}

export interface LineInput {
  serviceId: string;
  /** Units / sessions. */
  quantity: number;
  doctorId?: string | null;
  referralId?: string | null;
  /** The whole (remaining) course at once: the only case a discount is allowed. */
  fullCourse?: boolean;
  /** 0–100. */
  discountPercent?: number;
}

export interface CatalogService {
  id: string;
  name: string;
  price: number;
  kind: ServiceKind;
  isFollowUp: boolean;
}

export interface OpenReferral {
  id: string;
  serviceId: string;
  quantity: number;
  registeredQty: number;
  perDay: number | null;
}

export interface PricingFacts {
  services: Map<string, CatalogService>;
  /** Open referrals of this patient, by id. */
  referrals: Map<string, OpenReferral>;
  /** Active doctors, by id. */
  doctors: Set<string>;
  /** The case has a paid consultation within the free follow-up window. */
  followUpIsFree: boolean;
  maxDiscountPercent: number;
  /** An admin is registering, or approved this registration. */
  adminApproved: boolean;
}

export interface PricedLine {
  serviceId: string;
  serviceName: string;
  kind: ServiceKind;
  quantity: number;
  unitPrice: number;
  /** Money off this line. */
  discount: number;
  /** After discount. */
  total: number;
  doctorId: string | null;
  referralId: string | null;
  /** Sessions per day for course planning (from the referral), else null. */
  perDay: number | null;
}

const money = (n: number) => Math.round(n * 100) / 100;

export function priceLines(lines: LineInput[], facts: PricingFacts): PricedLine[] {
  if (lines.length === 0 || lines.length > 50) throw new PricingError('errors.noServices');
  // Two lines may not draw on the same referral (a double click must not register it twice).
  const used = new Set<string>();

  return lines.map((l) => {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 999) {
      throw new PricingError('errors.invalidQuantity');
    }
    const s = facts.services.get(l.serviceId);
    if (!s) throw new PricingError('errors.serviceUnavailable');

    let referral: OpenReferral | null = null;
    if (l.referralId) {
      referral = facts.referrals.get(l.referralId) ?? null;
      if (!referral || referral.serviceId !== s.id || used.has(referral.id)) {
        throw new PricingError('errors.referralUnavailable');
      }
      used.add(referral.id);
      if (l.quantity > referral.quantity - referral.registeredQty) {
        throw new PricingError('errors.invalidQuantity');
      }
    }

    let doctorId: string | null = null;
    if (s.kind === 'CONSULTATION') {
      if (!l.doctorId || !facts.doctors.has(l.doctorId)) {
        throw new PricingError('errors.doctorRequired');
      }
      doctorId = l.doctorId;
    }

    const unitPrice =
      s.kind === 'CONSULTATION' && s.isFollowUp && facts.followUpIsFree ? 0 : s.price;
    const gross = money(unitPrice * l.quantity);

    const pct = l.discountPercent ?? 0;
    if (!Number.isFinite(pct) || pct < 0 || pct > 100)
      throw new PricingError('errors.invalidDiscount');
    let discount = 0;
    if (pct > 0) {
      const isCourse = s.kind === 'PROCEDURE' && l.quantity >= 2 && l.fullCourse === true;
      const coversReferral = !referral || l.quantity === referral.quantity - referral.registeredQty;
      if (!isCourse || !coversReferral) throw new PricingError('errors.discountNotAllowed');
      if (pct > facts.maxDiscountPercent && !facts.adminApproved) {
        throw new PricingError('errors.discountNeedsAdmin');
      }
      discount = money((gross * pct) / 100);
    }

    return {
      serviceId: s.id,
      serviceName: s.name,
      kind: s.kind,
      quantity: l.quantity,
      unitPrice,
      discount,
      total: money(gross - discount),
      doctorId,
      referralId: referral?.id ?? null,
      perDay: referral?.perDay ?? null,
    };
  });
}

/** Planned day offsets of a course's sessions: `perDay` a day, starting today. */
export function sessionPlan(quantity: number, perDay: number | null): number[] {
  const n = perDay && perDay > 0 ? perDay : 1;
  return Array.from({ length: quantity }, (_, i) => Math.floor(i / n));
}
