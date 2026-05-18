import type { Gender, ISODateString } from './base';

// ── GET /sync/pull ────────────────────────────────────────────────────────────

export interface SyncPatient {
  id: string;
  clinicId: string;
  patientCode: string;
  fullName: string;
  phone: string;
  birthDate: ISODateString | null;
  gender: Gender | null;
  bloodType: string | null;
  allergies: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  active: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface SyncDoctor {
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

export interface SyncService {
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

export interface SyncPullResponse {
  patients: SyncPatient[];
  doctors: SyncDoctor[];
  services: SyncService[];
  syncTime: ISODateString;
}

// ── POST /sync/push ───────────────────────────────────────────────────────────

export interface SyncPushResponse {
  synced: number;
  ids: string[];
}
