import axios from 'axios';
import type { User, UserRole } from '@shared/types';

const baseURL = import.meta.env.VITE_API_URL ?? '/api';

export const axiosInstance = axios.create({ baseURL });

axiosInstance.interceptors.request.use((config) => {
  const raw = localStorage.getItem('posclinic-web-auth');
  if (raw) {
    try {
      const token: string | undefined = JSON.parse(raw)?.state?.token;
      if (token) config.headers.Authorization = `Bearer ${token}`;
    } catch { /* ignore */ }
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('posclinic-web-auth');
      window.location.href = '/web/login';
    }
    return Promise.reject(
      error instanceof Error
        ? error
        : new Error(error.response?.data?.message ?? String(error)),
    );
  },
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface CreateClinicData {
  organizationName: string;
  organizationNameUz?: string;
  organizationNameRu?: string;
  contactPhone?: string;
  address?: string;
  city?: string;
  region?: string;
}

export const auth = {
  login: async (email: string, password: string, clinicId?: string) => {
    const body: Record<string, string> = { email, password };
    if (clinicId) body.clinicId = clinicId;
    const { data } = await axiosInstance.post('/auth/login', body);
    return data as { token: string; user: User };
  },

  // ── OTP registration flow ──────────────────────────────────────────────────
  requestOtp: async (email: string) => {
    const { data } = await axiosInstance.post('/auth/request-otp', { email });
    return data as { success: boolean; message: string };
  },
  verifyOtp: async (email: string, code: string) => {
    const { data } = await axiosInstance.post('/auth/verify-otp', { email, code });
    return data as { success: boolean; isNewUser: boolean; registrationToken?: string };
  },
  setPassword: async (registrationToken: string, password: string, firstName: string, lastName: string) => {
    const { data } = await axiosInstance.post('/auth/set-password', { registrationToken, password, firstName, lastName });
    return data as { setupToken: string };
  },
  createClinic: async (setupToken: string, clinicData: CreateClinicData) => {
    const { data } = await axiosInstance.post('/auth/create-clinic', { setupToken, ...clinicData });
    return data as { token: string; clinicCode: string; tenant: { id: string; organizationName: string; clinicCode: string }; user: User };
  },

  logout: async () => {
    try { await axiosInstance.post('/auth/logout'); } catch { /* ignore */ }
  },
  getProfile: async (): Promise<User> => {
    const { data } = await axiosInstance.get('/auth/profile');
    return data;
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const { data } = await axiosInstance.post('/auth/change-password', { currentPassword, newPassword });
    return data;
  },
};

// ─── Patients ─────────────────────────────────────────────────────────────────

export interface PatientRecord {
  id: string;
  patientCode: string;
  fullName: string;
  phone: string;
  birthDate?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  bloodType?: string | null;
  allergies?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export const patients = {
  getAll: async (filters?: Record<string, unknown>): Promise<PatientRecord[]> => {
    const { data } = await axiosInstance.get('/patients', { params: filters });
    return data;
  },
  getById: async (id: string): Promise<PatientRecord> => {
    const { data } = await axiosInstance.get(`/patients/${id}`);
    return data;
  },
  create: async (payload: Partial<PatientRecord>): Promise<PatientRecord> => {
    const { data } = await axiosInstance.post('/patients', payload);
    return data;
  },
  update: async (id: string, payload: Partial<PatientRecord>): Promise<PatientRecord> => {
    const { data } = await axiosInstance.patch(`/patients/${id}`, payload);
    return data;
  },
  deactivate: async (id: string): Promise<PatientRecord> => {
    const { data } = await axiosInstance.patch(`/patients/${id}`, { active: false });
    return data;
  },
};

// ─── Doctors ──────────────────────────────────────────────────────────────────

export interface DoctorRecord {
  id: string;
  fullName: string;
  phone?: string | null;
  specialty?: string | null;
  licenseNo?: string | null;
  active: boolean;
  clinicId: string;
  createdAt: string;
}

export const doctors = {
  getAll: async (): Promise<DoctorRecord[]> => {
    const { data } = await axiosInstance.get('/doctors');
    return data;
  },
  getById: async (id: string): Promise<DoctorRecord> => {
    const { data } = await axiosInstance.get(`/doctors/${id}`);
    return data;
  },
  create: async (payload: Partial<DoctorRecord>): Promise<DoctorRecord> => {
    const { data } = await axiosInstance.post('/doctors', payload);
    return data;
  },
  update: async (id: string, payload: Partial<DoctorRecord>): Promise<DoctorRecord> => {
    const { data } = await axiosInstance.patch(`/doctors/${id}`, payload);
    return data;
  },
};

// ─── Services ─────────────────────────────────────────────────────────────────

export interface ServiceRecord {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  price: number;
  duration: number;
  active: boolean;
  clinicId: string;
  createdAt: string;
}

export const services = {
  getAll: async (): Promise<ServiceRecord[]> => {
    const { data } = await axiosInstance.get('/services');
    return data;
  },
  getById: async (id: string): Promise<ServiceRecord> => {
    const { data } = await axiosInstance.get(`/services/${id}`);
    return data;
  },
  create: async (payload: Partial<ServiceRecord>): Promise<ServiceRecord> => {
    const { data } = await axiosInstance.post('/services', payload);
    return data;
  },
  update: async (id: string, payload: Partial<ServiceRecord>): Promise<ServiceRecord> => {
    const { data } = await axiosInstance.patch(`/services/${id}`, payload);
    return data;
  },
};

// ─── Appointments ─────────────────────────────────────────────────────────────

export interface AppointmentRecord {
  id: string;
  appointmentNumber: string;
  clinicId: string;
  patientId: string;
  doctorId: string;
  appointmentDate: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  totalAmount: number;
  paidAmount: number;
  paymentStatus: 'PENDING' | 'PARTIAL' | 'PAID' | 'REFUNDED';
  paymentMethod?: string | null;
  diagnosis?: string | null;
  prescription?: string | null;
  notes?: string | null;
  synced: boolean;
  createdAt: string;
  patient?: { id: string; fullName: string; phone: string; patientCode: string };
  doctor?: { id: string; fullName: string; specialty?: string | null };
  items?: AppointmentItemRecord[];
}

export interface AppointmentItemRecord {
  id: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export const appointments = {
  getAll: async (filters?: Record<string, unknown>): Promise<AppointmentRecord[]> => {
    const { data } = await axiosInstance.get('/appointments', { params: filters });
    return data;
  },
  getById: async (id: string): Promise<AppointmentRecord> => {
    const { data } = await axiosInstance.get(`/appointments/${id}`);
    return data;
  },
  create: async (payload: Partial<AppointmentRecord>): Promise<AppointmentRecord> => {
    const { data } = await axiosInstance.post('/appointments', payload);
    return data;
  },
  update: async (id: string, payload: Partial<AppointmentRecord>): Promise<AppointmentRecord> => {
    const { data } = await axiosInstance.patch(`/appointments/${id}`, payload);
    return data;
  },
  getTodaySummary: async () => {
    const { data } = await axiosInstance.get('/appointments/today/summary');
    return data as { total: number; completed: number; pending: number; revenue: number };
  },
};

// ─── Users ────────────────────────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  isActive: boolean;
  tenantId: string;
  clinicId?: string | null;
  createdAt: string;
}

export const users = {
  getAll: async (): Promise<UserRecord[]> => {
    const { data } = await axiosInstance.get('/users');
    return data;
  },
  getById: async (id: string): Promise<UserRecord> => {
    const { data } = await axiosInstance.get(`/users/${id}`);
    return data;
  },
  create: async (payload: Partial<UserRecord> & { password: string }): Promise<UserRecord> => {
    const { data } = await axiosInstance.post('/users', payload);
    return data;
  },
  update: async (id: string, payload: Partial<UserRecord>): Promise<UserRecord> => {
    const { data } = await axiosInstance.patch(`/users/${id}`, payload);
    return data;
  },
  delete: async (id: string) => {
    const { data } = await axiosInstance.delete(`/users/${id}`);
    return data;
  },
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export const settings = {
  getAll: async (): Promise<Record<string, string>> => {
    const { data } = await axiosInstance.get('/settings');
    return data;
  },
  set: async (key: string, value: string) => {
    const { data } = await axiosInstance.put(`/settings/${key}`, { value });
    return data;
  },
};

// ─── Clinics (Super Admin) ────────────────────────────────────────────────────

export interface ClinicRecord {
  id: string;
  name: string;
  type: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  licenseNo?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { users: number; patients: number; appointments: number };
}

export const clinics = {
  getAll: async (): Promise<ClinicRecord[]> => {
    const { data } = await axiosInstance.get('/clinics');
    return data;
  },
  getById: async (id: string): Promise<ClinicRecord> => {
    const { data } = await axiosInstance.get(`/clinics/${id}`);
    return data;
  },
  create: async (payload: Partial<ClinicRecord>): Promise<ClinicRecord> => {
    const { data } = await axiosInstance.post('/clinics', payload);
    return data;
  },
  update: async (id: string, payload: Partial<ClinicRecord>): Promise<ClinicRecord> => {
    const { data } = await axiosInstance.patch(`/clinics/${id}`, payload);
    return data;
  },
  activate: async (id: string) => axiosInstance.put(`/clinics/${id}/activate`),
  deactivate: async (id: string) => axiosInstance.put(`/clinics/${id}/deactivate`),
};

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  clinicId: string;
  clinic?: { name: string };
  userId: string;
  user?: { fullName: string; phone: string };
  action: string;
  entity: string;
  entityId: string;
  details?: string | null;
  createdAt: string;
}

export interface AuditLogsResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export const auditLogs = {
  getAll: async (params?: Record<string, unknown>): Promise<AuditLogsResponse> => {
    const { data } = await axiosInstance.get('/logs/audit', { params });
    return data;
  },
};

// ─── Combined export ──────────────────────────────────────────────────────────

export const api = {
  auth,
  patients,
  doctors,
  services,
  appointments,
  users,
  settings,
  clinics,
  auditLogs,
};
