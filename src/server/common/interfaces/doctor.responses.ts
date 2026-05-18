import type { ISODateString } from './base';

// ── Doctor shape ──────────────────────────────────────────────────────────────

export interface DoctorResponse {
  id: string;
  clinicId: string;
  fullName: string;
  phone: string | null;
  specialty: string | null;
  licenseNo: string | null;
  active: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ── GET /doctors ──────────────────────────────────────────────────────────────
// ── GET /doctors/active ───────────────────────────────────────────────────────

export type DoctorListResponse = DoctorResponse[];

// ── GET /doctors/:id ─────────────────────────────────────────────────────────
// ── POST /doctors ─────────────────────────────────────────────────────────────
// ── PUT /doctors/:id ─────────────────────────────────────────────────────────

export type DoctorDetailResponse = DoctorResponse;
