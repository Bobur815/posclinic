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

/**
 * How a service behaves: CONSULTATION needs a doctor; ANALYSIS has a result; PROCEDURE can be a
 * course; DIRECT_SALE (drugs, ointments…) is done at payment: no queue, no case.
 */
export type ServiceKind = 'CONSULTATION' | 'ANALYSIS' | 'PROCEDURE' | 'DIRECT_SALE';
export const SERVICE_KINDS: readonly ServiceKind[] = [
  'CONSULTATION',
  'ANALYSIS',
  'PROCEDURE',
  'DIRECT_SALE',
];

/** What a custom staff type may do on the till: NONE = no login (on the staff list only). */
export type StaffAccess = 'NONE' | 'RECEPTIONIST' | 'NURSE' | 'CLINIC_ADMIN';
export const STAFF_ACCESS: readonly StaffAccess[] = ['NONE', 'RECEPTIONIST', 'NURSE', 'CLINIC_ADMIN'];

/** An order type the clinic adds in Settings → Types (e.g. "Drugs and ointments"). */
export interface ServiceTypeDto {
  id: string;
  nameUz: string;
  nameRu: string | null;
  behavior: ServiceKind;
  color: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A staff type the clinic adds (cleaner, guard, accountant…). */
export interface StaffTypeDto {
  id: string;
  nameUz: string;
  nameRu: string | null;
  access: StaffAccess;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceTypeInput {
  id?: string;
  nameUz: string;
  nameRu?: string | null;
  behavior: ServiceKind;
  color?: string | null;
  sortOrder?: number;
  active?: boolean;
}

export interface StaffTypeInput {
  id?: string;
  nameUz: string;
  nameRu?: string | null;
  access: StaffAccess;
  active?: boolean;
}
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
  chronicConditions: string | null;
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
  /** Medical field: a doctor / nurse may edit it (with allergies and blood type). */
  chronicConditions?: string | null;
  notes?: string | null;
}

export interface DoctorDto {
  id: string;
  fullName: string;
  phone: string | null;
  specialty: string | null;
  licenseNo: string | null;
  /** The doctor's till login; null = none yet. */
  userId: string | null;
  /** `doctors:getAll` only. */
  user?: { phone: string; active: boolean } | null;
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
  /** Till-only picture (data URL), shown in the desktop app; null = none. */
  image: string | null;
  /** Fiscal receipt (v2.6): MXIK and package code; null = the kind's default in settings. */
  mxik: string | null;
  packageCode: string | null;
  /** Custom order type; `kind` is then its behaviour. */
  serviceTypeId: string | null;
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
  /** Data URL; null removes it, undefined leaves it. */
  image?: string | null;
  /** 17 digits; null / '' = none (clears the package code too). */
  mxik?: string | null;
  packageCode?: string | null;
  /** A custom order type sets `kind` to its behaviour; null = none (kind as sent). */
  serviceTypeId?: string | null;
  active?: boolean;
}

export interface AppointmentItemDto {
  id: string;
  appointmentId: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  /** Money off this line (a full course paid upfront); `total` is after it. */
  discount: number;
  total: number;
  /** Consultation lines: whose queue it is in. */
  doctorId: string | null;
  referralId: string | null;
  status: ItemStatus;
  performedBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AppointmentDto {
  id: string;
  appointmentNumber: string;
  patientId: string;
  /** Doctor of the consultation in this order; null for analysis / procedure orders. */
  doctorId: string | null;
  caseId: string | null;
  appointmentDate: string;
  status: AppointmentStatus;
  totalAmount: number;
  discountAmount: number;
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
  doctor: DoctorDto | null;
  items: AppointmentItemDto[];
}

/** `patients:getById`: the patient with the last 20 visits. */
export interface PatientWithVisitsDto extends PatientDto {
  appointments: Array<Omit<AppointmentDto, 'patient'>>;
  /** At most one: the latest measurement (v2.5). */
  vitals: VitalsDto[];
  cases: Array<{
    id: string;
    caseNumber: string;
    status: CaseStatus;
    openedAt: string;
    diagnosis: string | null;
  }>;
}

/** One line of a registration at reception (`appointments:create` / `appointments:quote`). */
export interface RegisterLineInput {
  serviceId: string;
  /** Units / sessions. */
  quantity: number;
  /** Consultations only (required there). */
  doctorId?: string | null;
  /** The doctor's referral this line registers. */
  referralId?: string | null;
  /** The whole remaining course at once: the only case a discount is allowed. */
  fullCourse?: boolean;
  /** 0–100; above the clinic limit needs an admin (`approval`). */
  discountPercent?: number;
}

/**
 * A registration: one paid order. Names, prices, follow-up and discounts are set by the main till
 * from its own data (src/main/clinic/pricing.ts), never by the caller. No `caseId` opens a new
 * case (a new visit for the plan limit).
 */
export interface AppointmentCreateInput {
  patientId: string;
  caseId?: string | null;
  /** ISO date-time; now when omitted. */
  appointmentDate?: string;
  notes?: string;
  items: RegisterLineInput[];
  /** An admin's phone + password when a receptionist gives more than the allowed discount. */
  approval?: { phone: string; password: string } | null;
  /** Legacy: one doctor for the whole visit. */
  doctorId?: string;
}

export interface QuoteLineDto {
  serviceId: string;
  serviceName: string;
  kind: ServiceKind;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  doctorId: string | null;
  referralId: string | null;
  perDay: number | null;
}

/** `appointments:quote`: what `appointments:create` would charge; nothing is written. */
export interface QuoteDto {
  quote: true;
  lines: QuoteLineDto[];
  totalAmount: number;
  discountAmount: number;
  followUpIsFree: boolean;
  maxDiscountPercent: number;
  /** A line is above the receptionist's limit: saving needs an admin's phone + password. */
  needsAdminApproval: boolean;
}

export type CaseStatus =
  | 'OPEN'
  | 'WAITING_DOCTOR'
  | 'WAITING_ANALYSIS'
  | 'RESULT_READY'
  | 'ON_TREATMENT'
  | 'CLOSED';
export type ItemStatus = 'WAITING' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type ReferralStatus = 'PENDING' | 'PARTIAL' | 'REGISTERED' | 'CANCELLED';

export interface ReferralDto {
  id: string;
  caseId: string;
  patientId: string;
  doctorId: string | null;
  serviceId: string;
  quantity: number;
  perDay: number | null;
  days: number | null;
  instructions: string | null;
  registeredQty: number;
  status: ReferralStatus;
  createdAt: string;
  updatedAt: string;
}

/** `cases:forPatient`: an open case with what is still to register. */
export interface OpenCaseDto {
  id: string;
  caseNumber: string;
  patientId: string;
  doctorId: string | null;
  status: CaseStatus;
  complaint: string | null;
  diagnosis: string | null;
  openedAt: string;
  doctor: { id: string; fullName: string } | null;
  /** A follow-up consultation registered before this is free; null when not free. */
  followUpFreeUntil: string | null;
  referrals: Array<
    ReferralDto & {
      remaining: number;
      service: { id: string; name: string; kind: ServiceKind; price: number; active: boolean };
      doctor: { id: string; fullName: string } | null;
    }
  >;
}

/** `patients:recent`: a patient of the latest visits (registration step 1). */
export interface RecentPatientDto extends PatientDto {
  lastVisitAt: string;
  lastServices: string[];
}

/** `patients:search`: text and / or filters (codes, `YYYY-MM-DD` visit dates). */
export interface PatientSearch {
  q?: string;
  regionCode?: string | null;
  districtCode?: string | null;
  visitedFrom?: string;
  visitedTo?: string;
}

export interface ClinicSettingsDto {
  followUpFreeDays: number;
  maxDiscountPercent: number;
  printTicketAfterPayment: boolean;
  /** Login page: keep the password too when "Remember me" is ticked (encrypted, that PC only). */
  savePasswordOnLogin: boolean;
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

// ── Doctor's side (v2.5, P3) ──────────────────────────────────────────────────────────────

/** `queue:listMine` / `queue:listOverview`: a paid line waiting in a queue. */
export interface QueueItemDto extends AppointmentItemDto {
  service: { id: string; name: string; kind: ServiceKind };
  doctor: { id: string; fullName: string } | null;
  appointment: {
    id: string;
    appointmentNumber: string;
    appointmentDate: string;
    createdAt: string;
    caseId: string | null;
    patient: Pick<PatientDto, 'id' | 'patientCode' | 'fullName' | 'phone' | 'birthDate' | 'gender'>;
    case: { id: string; caseNumber: string; status: CaseStatus } | null;
  };
}

export interface VitalsDto {
  id: string;
  patientId: string;
  caseId: string | null;
  heightCm: number | null;
  weightKg: number | null;
  temperature: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  pregnant: boolean | null;
  complaints: string | null;
  recordedBy: string | null;
  recordedAt: string;
}

export interface VitalsInput {
  patientId: string;
  caseId?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  temperature?: number | null;
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  pregnant?: boolean | null;
  complaints?: string | null;
}

export interface TreatmentSessionDto {
  id: string;
  itemId: string;
  number: number;
  plannedDate: string | null;
  doneAt: string | null;
  doneBy: string | null;
}

export interface AnalysisResultDto {
  id: string;
  itemId: string;
  caseId: string | null;
  patientId: string;
  serviceId: string;
  outcome: 'POSITIVE' | 'NEGATIVE' | null;
  value: number | null;
  unit: string | null;
  finding: string | null;
  comment: string | null;
  sampleTakenAt: string | null;
  enteredBy: string | null;
  enteredAt: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  service: { id: string; name: string; resultType: ResultType | null };
}

/** `cases:get`: everything the case page shows. */
export interface CaseDetailDto {
  id: string;
  caseNumber: string;
  patientId: string;
  doctorId: string | null;
  status: CaseStatus;
  complaint: string | null;
  diagnosis: string | null;
  openedAt: string;
  closedAt: string | null;
  patient: PatientDto;
  doctor: { id: string; fullName: string } | null;
  appointments: Array<
    Omit<AppointmentDto, 'patient' | 'doctor' | 'items'> & {
      items: Array<
        AppointmentItemDto & {
          service: { id: string; name: string; kind: ServiceKind; resultType: ResultType | null };
          doctor: { id: string; fullName: string } | null;
          sessions: TreatmentSessionDto[];
        }
      >;
    }
  >;
  referrals: Array<ReferralDto & { service: { id: string; name: string; kind: ServiceKind } }>;
  vitals: VitalsDto[];
  analysisResults: AnalysisResultDto[];
  latestVitals: VitalsDto | null;
  otherCases: Array<{
    id: string;
    caseNumber: string;
    status: CaseStatus;
    openedAt: string;
    closedAt: string | null;
    diagnosis: string | null;
  }>;
}

export interface CaseUpdateInput {
  complaint?: string | null;
  diagnosis?: string | null;
  close?: boolean;
  reopen?: boolean;
}

/** `cases:addReferral`: an analysis (quantity) or a course (perDay × days). */
export interface ReferralInput {
  serviceId: string;
  quantity?: number;
  perDay?: number | null;
  days?: number | null;
  instructions?: string | null;
}

// ── Lab and procedures (v2.5, P4) ─────────────────────────────────────────────────────────

/** `queue:listLab`: paid analyses to do and course sessions due up to today. */
export interface LabQueueDto {
  analyses: Array<
    AppointmentItemDto & {
      service: {
        id: string;
        name: string;
        kind: ServiceKind;
        resultType: ResultType | null;
        resultUnit: string | null;
        referenceRange: string | null;
      };
      results: Array<Omit<AnalysisResultDto, 'service'>>;
      appointment: {
        id: string;
        appointmentNumber: string;
        createdAt: string;
        caseId: string | null;
        patient: Pick<PatientDto, 'id' | 'patientCode' | 'fullName' | 'phone' | 'birthDate' | 'gender'>;
      };
    }
  >;
  sessions: Array<
    TreatmentSessionDto & {
      item: {
        id: string;
        serviceName: string;
        quantity: number;
        appointment: {
          id: string;
          caseId: string | null;
          patient: Pick<PatientDto, 'id' | 'patientCode' | 'fullName' | 'phone' | 'birthDate' | 'gender'>;
        };
        _count: { sessions: number };
      };
    }
  >;
}

/** `results:save`: shaped by the service's result type. */
export interface ResultInput {
  outcome?: 'POSITIVE' | 'NEGATIVE';
  value?: number | string;
  finding?: string;
  comment?: string;
}

/** `queue:listResultsReady`: the doctor's cases with results to confirm. */
export interface ResultsReadyDto {
  id: string;
  caseNumber: string;
  status: CaseStatus;
  patient: Pick<PatientDto, 'id' | 'patientCode' | 'fullName' | 'phone' | 'birthDate' | 'gender'>;
  analysisResults: Array<{ id: string; enteredAt: string; service: { name: string } }>;
}

// ── Staff logins (v2.5) ───────────────────────────────────────────────────────────────────

/** STAFF: a custom type without till access (cleaner, guard…): on the list, never signs in. */
export type StaffRole = 'CLINIC_ADMIN' | 'SUPER_ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'NURSE' | 'STAFF';

/** `users:list`: never the password hash. `doctor` set = a doctor's login (Doctors page). */
export interface StaffDto {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  doctor?: { id: string } | null;
  /** Custom staff type; `role` follows its access. */
  staffTypeId: string | null;
}

/** `users:create` (RECEPTIONIST | NURSE | CLINIC_ADMIN) and `users:update`. */
export interface StaffInput {
  fullName: string;
  phone: string;
  /** A built-in role, or omitted when `staffTypeId` is set (its access decides). */
  role?: 'RECEPTIONIST' | 'NURSE' | 'CLINIC_ADMIN';
  staffTypeId?: string | null;
  /** Not needed for a no-login type. */
  password?: string;
}

// ── Cash shifts (v2.6) ───────────────────────────────────────────────────────────────────────

export type CashMovementType = 'PAY_IN' | 'PAY_OUT';

export interface ShiftDto {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  openedBy: string | null;
  closedBy: string | null;
  openingCash: number;
  /** Counted at close; null while open. */
  countedCash: number | null;
  /** Frozen at close; null while open. */
  expectedCash: number | null;
  /** counted - expected; null while open. */
  difference: number | null;
  fiscalZReportId: number | null;
  fiscalZClosedAt: string | null;
}

export interface CashMovementDto {
  id: string;
  type: CashMovementType;
  amount: number;
  note: string;
  createdAt: string;
  createdBy: string | null;
}

export interface ShiftSummaryDto {
  shift: ShiftDto;
  sales: Record<PaymentMethod, number>;
  salesTotal: number;
  visits: number;
  payIn: number;
  payOut: number;
  /** The open shift's expected cash now, or the figure frozen at close. */
  expectedCash: number;
  movements: CashMovementDto[];
}

/** What closing a shift returns: the shift and, with fiscal receipts on, what VCR could not do. */
export interface ShiftCloseResultDto {
  shift: ShiftDto;
  fiscalProblem: string | null;
}

/** A tasnif.soliq.uz search hit (v2.6). */
export interface MxikHitDto {
  code: string;
  name: string;
  className: string;
  groupName: string;
}

export interface MxikPackageDto {
  code: string;
  name: string;
}

export type TasnifLang = 'uz_latn' | 'uz_cyrl' | 'ru';
