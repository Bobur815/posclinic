import type { ClinicType, ISODateString } from './base';

// ── Clinic shape ──────────────────────────────────────────────────────────────

export interface ClinicResponse {
  id: string;
  tenantId: string;
  name: string;
  type: ClinicType;
  address: string | null;
  phone: string | null;
  email: string | null;
  licenseNo: string | null;
  active: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  _count: { users: number; patients: number; appointments: number };
}

// ── GET /clinics ──────────────────────────────────────────────────────────────

export type ClinicListResponse = ClinicResponse[];

// ── GET /clinics/:id ──────────────────────────────────────────────────────────
// ── PUT /clinics/:id ──────────────────────────────────────────────────────────
// ── PUT /clinics/:id/activate ─────────────────────────────────────────────────
// ── PUT /clinics/:id/deactivate ───────────────────────────────────────────────

export type ClinicDetailResponse = ClinicResponse;
