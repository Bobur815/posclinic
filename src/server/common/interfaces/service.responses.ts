import type { ISODateString } from './base';

// ── Service shape ─────────────────────────────────────────────────────────────

export interface ServiceResponse {
  id: string;
  clinicId: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  duration: number;
  active: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ── GET /services ─────────────────────────────────────────────────────────────
// ── GET /services?search=query ────────────────────────────────────────────────
// ── GET /services/active ──────────────────────────────────────────────────────

export type ServiceListResponse = ServiceResponse[];

// ── POST /services ────────────────────────────────────────────────────────────
// ── PUT /services/:id ─────────────────────────────────────────────────────────

export type ServiceMutationResponse = ServiceResponse;
