import type {
  AppointmentStatus,
  Gender,
  ISODateString,
  PaymentMethod,
  PaymentStatus,
} from './base';

// ── Patient shape ─────────────────────────────────────────────────────────────

export interface PatientResponse {
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

// ── GET /patients ─────────────────────────────────────────────────────────────

export type PatientListResponse = PatientResponse[];

// ── GET /patients/:id ─────────────────────────────────────────────────────────

export interface PatientDetailResponse extends PatientResponse {
  appointments: Array<{
    id: string;
    appointmentNumber: string;
    appointmentDate: ISODateString;
    status: AppointmentStatus;
    totalAmount: number;
    paidAmount: number;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod | null;
    diagnosis: string | null;
    prescription: string | null;
    notes: string | null;
    doctor: { fullName: string; specialty: string | null };
    items: Array<{
      id: string;
      serviceId: string;
      serviceName: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    createdAt: ISODateString;
    updatedAt: ISODateString;
  }>;
}

// ── POST /patients ────────────────────────────────────────────────────────────
// ── PUT /patients/:id ─────────────────────────────────────────────────────────

export type PatientMutationResponse = PatientResponse;
