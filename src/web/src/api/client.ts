import axios, { AxiosError } from 'axios';

/**
 * Typed client for the Dashboard section of `.claude/rules/server-api.md`.
 * Every call is scoped by the clinic in the JWT; the web never sends a clinic id.
 */

export const AUTH_STORAGE_KEY = 'posclinic-web-auth';

const baseURL = import.meta.env.VITE_API_URL ?? '/api';

export const http = axios.create({ baseURL });

function storedToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw)?.state?.token ?? null) : null;
  } catch {
    return null;
  }
}

http.interceptors.request.use((config) => {
  const token = storedToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Set by the auth store so a 401 clears the session without a circular import. */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

/** Error whose `code` is the server's `server.errors.<code>` (or a generic one). */
export class ApiError extends Error {
  constructor(
    public code: string,
    public status?: number,
    public details?: string[],
  ) {
    super(code);
  }
}

http.interceptors.response.use(
  (r) => r,
  (error: AxiosError<{ message?: string | string[] }>) => {
    const status = error.response?.status;
    const isLogin = error.config?.url?.includes('/auth/login');
    if (status === 401 && !isLogin) onUnauthorized?.();

    const msg = error.response?.data?.message;
    if (Array.isArray(msg)) return Promise.reject(new ApiError('validation', status, msg));
    if (typeof msg === 'string' && msg.startsWith('server.errors.')) {
      return Promise.reject(new ApiError(msg.slice('server.errors.'.length), status));
    }
    if (!error.response) return Promise.reject(new ApiError('network'));
    return Promise.reject(new ApiError('generic', status));
  },
);

// ─── Shapes ──────────────────────────────────────────────────────────────────

export type StaffRole = 'CLINIC_ADMIN' | 'SUPER_ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'NURSE' | 'STAFF';
export type AppointmentStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'REFUNDED';

export interface Paged<T> {
  items: T[];
  total: number;
}

export interface AuthUser {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: StaffRole;
}

export interface ClinicInfo {
  id: string;
  name: string;
  plan: string | null;
  expiresAt: string | null;
}

export interface Terminal {
  terminalId: string;
  lastSyncAt: string | null;
  appVersion: string | null;
}

export interface ClinicDetails extends ClinicInfo {
  lastSyncAt: string | null;
  terminals: Terminal[];
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  clinic: ClinicInfo;
}

export interface Patient {
  id: string;
  patientCode: string;
  fullName: string;
  phone: string;
  birthDate: string | null;
  gender: string | null;
  bloodType: string | null;
  allergies: string | null;
  address: string | null;
  city: string | null;
  /** SOATO codes (till v2.5); `city` is the readable "District, Region". */
  regionCode?: string | null;
  districtCode?: string | null;
  chronicConditions?: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentItem {
  id: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  total: number;
  /** WAITING | IN_PROGRESS | DONE | CANCELLED (till v2.5). */
  status?: string;
  sessions?: { id: string; number: number; plannedDate: string | null; doneAt: string | null }[];
}

export interface Appointment {
  id: string;
  appointmentNumber: string;
  patientId: string;
  /** Null for an analysis / procedure order (till v2.5). */
  doctorId: string | null;
  caseId?: string | null;
  appointmentDate: string;
  status: AppointmentStatus;
  totalAmount: number;
  discountAmount?: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  diagnosis: string | null;
  prescription: string | null;
  notes: string | null;
  terminalId: string | null;
  createdAt: string;
  updatedAt: string;
  items: AppointmentItem[];
  /** Not in the row shape of the contract; shown when the server joins them in. */
  patient?: { id: string; fullName: string; patientCode?: string; phone?: string } | null;
  doctor?: { id: string; fullName: string } | null;
}

export interface ClinicalCase {
  id: string;
  caseNumber: string;
  patientId: string;
  doctorId: string | null;
  status: string;
  complaint: string | null;
  diagnosis: string | null;
  openedAt: string;
  closedAt: string | null;
  updatedAt: string;
}

export interface Vitals {
  id: string;
  caseId: string | null;
  heightCm: number | null;
  weightKg: number | null;
  temperature: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  pregnant: boolean | null;
  recordedAt: string;
}

export interface AnalysisResult {
  id: string;
  caseId: string | null;
  serviceId: string;
  serviceName: string | null;
  outcome: 'POSITIVE' | 'NEGATIVE' | null;
  value: number | null;
  unit: string | null;
  finding: string | null;
  comment: string | null;
  enteredAt: string | null;
  confirmedAt: string | null;
}

export interface PatientDetails extends Patient {
  visits: Appointment[];
  /** Till v2.5; absent on an older server. */
  cases?: ClinicalCase[];
  latestVitals?: Vitals | null;
  results?: AnalysisResult[];
}

export interface Doctor {
  id: string;
  fullName: string;
  phone: string | null;
  specialty: string | null;
  licenseNo: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Service {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  duration: number;
  /** CONSULTATION | ANALYSIS | PROCEDURE (till v2.5). */
  kind?: ServiceKind;
  isFollowUp?: boolean;
  resultType?: 'QUALITATIVE' | 'QUANTITATIVE' | 'TEXT' | null;
  /** The till's custom order type, if any. */
  serviceTypeId?: string | null;
  /** Fiscal receipt codes, set on the till (v2.6); read-only here. */
  mxik?: string | null;
  packageCode?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ServiceKind = 'CONSULTATION' | 'ANALYSIS' | 'PROCEDURE' | 'DIRECT_SALE';

/** The clinic's own types, made on the till (Settings → Types); read-only here. */
export interface ClinicTypes {
  serviceTypes: { id: string; nameUz: string; nameRu: string | null; behavior: ServiceKind; color: string | null; active: boolean }[];
  staffTypes: { id: string; nameUz: string; nameRu: string | null; access: string; active: boolean }[];
}

export interface StaffUser {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: StaffRole;
  active: boolean;
  /** The till's custom staff type, if any. */
  staffTypeId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RankRow {
  name: string;
  count: number;
  revenue: number;
}

export interface DashboardSummary {
  visits: number;
  completed: number;
  cancelled: number;
  revenue: number;
  debt: number;
  newPatients: number;
  topServices: RankRow[];
  topDoctors: RankRow[];
}

export interface ReportBreakdownRow {
  name: string;
  count?: number;
  visits?: number;
  revenue: number;
  paid?: number;
  debt?: number;
}

export interface ReportDayRow {
  date: string;
  visits: number;
  revenue: number;
  paid?: number;
  debt?: number;
}

export interface Report {
  totals: { visits: number; revenue: number; paid: number; debt: number };
  byDoctor: ReportBreakdownRow[];
  byService: ReportBreakdownRow[];
  byDay?: ReportDayRow[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  /** Ids / field names only, never patient data: `{ fields: string[] }`, `{ role }`, ... */
  details: Record<string, unknown> | string | null;
  createdAt: string;
  userId?: string;
  user?: { id: string; fullName: string } | null;
  userName?: string | null;
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

const get = async <T>(url: string, params?: Record<string, unknown>) =>
  (await http.get<T>(url, { params: clean(params) })).data;
const post = async <T>(url: string, body?: unknown) => (await http.post<T>(url, body)).data;
const put = async <T>(url: string, body?: unknown) => (await http.put<T>(url, body)).data;

/** Catalog lists: the contract does not fix array vs `{ items }`, so accept both. */
const list = async <T>(url: string) => {
  const data = await get<T[] | Paged<T>>(url);
  return Array.isArray(data) ? data : (data?.items ?? []);
};

/** Drop empty query params so the server sees "no filter", not `status=`. */
function clean(params?: Record<string, unknown>) {
  if (!params) return undefined;
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

export const authApi = {
  login: (phone: string, password: string) => post<LoginResponse>('/auth/login', { phone, password }),
  profile: () => get<AuthUser>('/auth/profile'),
  changePassword: (currentPassword: string, newPassword: string) =>
    put<unknown>('/auth/change-password', { currentPassword, newPassword }),
};

export const clinicApi = {
  get: () => get<ClinicDetails>('/clinic'),
};

export const dashboardApi = {
  summary: (date: string) => get<DashboardSummary>('/dashboard/summary', { date }),
};

export const patientsApi = {
  list: (q: { search?: string; page?: number; pageSize?: number }) => get<Paged<Patient>>('/patients', q),
  get: (id: string) => get<PatientDetails>(`/patients/${encodeURIComponent(id)}`),
};

export interface AppointmentQuery {
  from?: string;
  to?: string;
  status?: string;
  doctorId?: string;
  page?: number;
  pageSize?: number;
}

export const appointmentsApi = {
  list: (q: AppointmentQuery) => get<Paged<Appointment>>('/appointments', { ...q }),
  get: (id: string) => get<Appointment>(`/appointments/${encodeURIComponent(id)}`),
};

export const reportsApi = {
  daily: (date: string) => get<Report>('/reports/daily', { date }),
  monthly: (month: string) => get<Report>('/reports/monthly', { month }),
};

export type ServiceInput = Pick<Service, 'code' | 'name' | 'price' | 'duration' | 'active'> & {
  description?: string | null;
  kind?: ServiceKind;
  isFollowUp?: boolean;
  resultType?: 'QUALITATIVE' | 'QUANTITATIVE' | 'TEXT' | null;
};
export const typesApi = {
  list: () => get<ClinicTypes>('/types'),
};
export const servicesApi = {
  list: () => list<Service>('/services'),
  create: (body: ServiceInput) => post<Service>('/services', body),
  update: (id: string, body: Partial<ServiceInput>) => put<Service>(`/services/${encodeURIComponent(id)}`, body),
};

export type DoctorInput = Pick<Doctor, 'fullName' | 'phone' | 'specialty' | 'licenseNo' | 'active'>;
export const doctorsApi = {
  list: () => list<Doctor>('/doctors'),
  create: (body: DoctorInput) => post<Doctor>('/doctors', body),
  update: (id: string, body: Partial<DoctorInput>) => put<Doctor>(`/doctors/${encodeURIComponent(id)}`, body),
};

export type UserInput = Pick<StaffUser, 'fullName' | 'phone' | 'email' | 'role' | 'active'> & { password?: string };
export const usersApi = {
  list: () => list<StaffUser>('/users'),
  create: (body: UserInput & { password: string }) => post<StaffUser>('/users', body),
  update: (id: string, body: Partial<Omit<UserInput, 'password'>>) =>
    put<StaffUser>(`/users/${encodeURIComponent(id)}`, body),
  resetPassword: (id: string, newPassword: string) =>
    post<unknown>(`/users/${encodeURIComponent(id)}/reset-password`, { newPassword }),
};

export const auditApi = {
  list: (page: number, pageSize = 50) => get<Paged<AuditLogEntry>>('/audit-logs', { page, pageSize }),
};
