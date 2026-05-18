import type { AppointmentStatus, ISODateString, PaymentMethod, PaymentStatus } from './base';

// ── Sub-shapes ────────────────────────────────────────────────────────────────

export interface AppointmentItemResponse {
  id: string;
  appointmentId: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface AppointmentPatientRef {
  fullName: string;
  phone: string;
}

export interface AppointmentDoctorRef {
  fullName: string;
}

// ── Appointment shape (list) ──────────────────────────────────────────────────

export interface AppointmentResponse {
  id: string;
  clinicId: string;
  appointmentNumber: string;
  patientId: string;
  doctorId: string;
  appointmentDate: ISODateString;
  status: AppointmentStatus;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  diagnosis: string | null;
  prescription: string | null;
  notes: string | null;
  terminalId: string | null;
  synced: boolean;
  syncedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  patient: AppointmentPatientRef;
  doctor: AppointmentDoctorRef;
  items: AppointmentItemResponse[];
}

// ── Appointment shape (detail — includes patientCode, doctor specialty) ────────

export interface AppointmentDetailResponse extends Omit<AppointmentResponse, 'patient' | 'doctor'> {
  patient: { id: string; fullName: string; phone: string; patientCode: string };
  doctor: { fullName: string; specialty: string | null };
}

// ── GET /appointments ─────────────────────────────────────────────────────────

export type AppointmentListResponse = AppointmentResponse[];

// ── GET /appointments/:id ─────────────────────────────────────────────────────

export type AppointmentDetailResult = AppointmentDetailResponse;

// ── POST /appointments ────────────────────────────────────────────────────────

export interface AppointmentCreateResponse {
  id: string;
  clinicId: string;
  appointmentNumber: string;
  patientId: string;
  doctorId: string;
  appointmentDate: ISODateString;
  status: AppointmentStatus;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  diagnosis: string | null;
  prescription: string | null;
  notes: string | null;
  terminalId: string | null;
  synced: boolean;
  syncedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  items: AppointmentItemResponse[];
}

// ── PUT /appointments/:id ─────────────────────────────────────────────────────
// ── POST /appointments/:id/checkout ──────────────────────────────────────────

export type AppointmentMutationResponse = AppointmentResponse;

// ── GET /appointments/summary/today ──────────────────────────────────────────

export interface TodaySummaryResponse {
  total: number;
  completed: number;
  pending: number;
  revenue: number;
}
