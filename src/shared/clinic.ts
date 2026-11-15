/**
 * What the till's clinic channels take and return over IPC (`src/main/ipc/*-handlers.ts`).
 * Field names are the Prisma ones (`prisma/schema.sqlite.prisma`); `ipcSafe()` turns dates into
 * ISO strings and Decimal money into numbers. Pages type their reads from here, not from
 * hand-written interfaces (tasks/lessons.md: `isActive` vs `active`).
 */

export type AppointmentStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'INSURANCE';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

/** CONSULTATION needs a doctor; ANALYSIS has a result; PROCEDURE can be a course. */
export type ServiceKind = 'CONSULTATION' | 'ANALYSIS' | 'PROCEDURE';
export const SERVICE_KINDS: readonly ServiceKind[] = ['CONSULTATION', 'ANALYSIS', 'PROCEDURE'];
/** How an analysis result is entered: positive/negative, a number, or text. */
export type ResultType = 'QUALITATIVE' | 'QUANTITATIVE' | 'TEXT';
export const RESULT_TYPES: readonly ResultType[] = ['QUALITATIVE', 'QUANTITATIVE', 'TEXT'];

export interface PatientDto {
  id: string;
  patientCode: string;
  fullName: string;
  /** `+998XXXXXXXXX` */
  phone: string;
  birthDate: string | null;
  gender: string | null;
  bloodType: string | null;
  allergies: string | null;
  address: string | null;
  /** "District, Region" (Uzbek) when chosen from the selector; legacy free text otherwise. */
  city: string | null;
  /** SOATO codes (shared/address.ts); null when no address was chosen. */
  regionCode: string | null;
  districtCode: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `patients:create` / `patients:update`. Empty strings clear an optional field. */
export interface PatientInput {
  fullName?: string;
  phone?: string;
  /** `YYYY-MM-DD` or ISO; empty clears it. */
  birthDate?: string | null;
  gender?: Gender | '' | null;
  bloodType?: string | null;
  allergies?: string | null;
  /** Street / house (free text). */
  address?: string | null;
  /** Legacy free text; ignored when regionCode/districtCode are sent (the till derives it). */
  city?: string | null;
  /** SOATO codes from the AddressSelector; the district must belong to the region. */
  regionCode?: string | null;
  districtCode?: string | null;
  notes?: string | null;
}

export interface DoctorDto {
  id: string;
  fullName: string;
  phone: string | null;
  specialty: string | null;
  licenseNo: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `doctors:create` ignores `active` (a new doctor is active). */
export interface DoctorInput {
  fullName?: string;
  phone?: string | null;
  specialty?: string | null;
  licenseNo?: string | null;
  active?: boolean;
}

export interface ServiceDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  /** Minutes. */
  duration: number;
  kind: ServiceKind;
  /** Repeat consultation: free within the follow-up window of a paid consultation. */
  isFollowUp: boolean;
  /** ANALYSIS only. */
  resultType: ResultType | null;
  resultUnit: string | null;
  referenceRange: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceInput {
  code?: string;
  name?: string;
  description?: string | null;
  price?: number;
  duration?: number;
  kind?: ServiceKind;
  isFollowUp?: boolean;
  resultType?: ResultType | null;
  resultUnit?: string | null;
  referenceRange?: string | null;
  active?: boolean;
}

export interface AppointmentItemDto {
  id: string;
  appointmentId: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface AppointmentDto {
  id: string;
  appointmentNumber: string;
  patientId: string;
  doctorId: string;
  appointmentDate: string;
  status: AppointmentStatus;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
  diagnosis: string | null;
  prescription: string | null;
  notes: string | null;
  terminalId: string | null;
  createdAt: string;
  updatedAt: string;
  patient: PatientDto;
  doctor: DoctorDto;
  items: AppointmentItemDto[];
}

/** `patients:getById`: the patient with the last 20 visits. */
export interface PatientWithVisitsDto extends PatientDto {
  appointments: Array<Omit<AppointmentDto, 'patient'>>;
}

export interface AppointmentCreateInput {
  patientId: string;
  doctorId: string;
  /** ISO date-time. */
  appointmentDate: string;
  notes?: string;
  /**
   * Which services and how many. Names, prices and totals are set by the main till from its own
   * catalog (appointment-handlers.ts), never by the caller.
   */
  items: Array<{ serviceId: string; quantity: number }>;
}

/** `appointments:getAll`. A date range is a report (licence: `reports` beyond one day). */
export interface AppointmentFilters {
  status?: AppointmentStatus;
  today?: boolean;
  /** One calendar day, `YYYY-MM-DD`. */
  date?: string;
  startDate?: string;
  endDate?: string;
}

/** `appointments:update`: no money here (checkout only). */
export interface AppointmentUpdateInput {
  status?: AppointmentStatus;
  diagnosis?: string | null;
  prescription?: string | null;
  notes?: string | null;
}

export interface CheckoutInput {
  paymentMethod: PaymentMethod;
  /** Money taken now; more than what is owed is change, not credit. */
  amount: number;
}

export interface TodaySummaryDto {
  total: number;
  completed: number;
  /** Money collected today (full and partial payments). */
  revenue: number;
  /** Today's visits not cancelled and not fully paid. */
  pending: number;
  recentAppointments: Array<Omit<AppointmentDto, 'items'>>;
}
