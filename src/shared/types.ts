// Shared types used across main, renderer, and server

export type UserRole =
  // New multi-tenant roles
  | 'PLATFORM_ADMIN'
  | 'SUPERADMIN'
  | 'ADMIN'
  | 'NURSE'
  | 'PATIENT'
  // Legacy Electron roles (kept for backward compatibility)
  | 'SUPER_ADMIN'
  | 'CLINIC_ADMIN'
  | 'DOCTOR'
  | 'RECEPTIONIST';

export type Gender = 'MALE' | 'FEMALE';
export type AppointmentStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID';
export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'INSURANCE';

export interface User {
  id: string;
  // New fields (web / multi-tenant)
  firstName?: string;
  lastName?: string;
  email?: string;
  tenantId?: string;
  // Legacy fields (Electron / phone-based auth)
  fullName?: string;
  phone?: string;
  role: UserRole;
  clinicId?: string | null;
}

export interface Patient {
  id: string;
  patientCode: string;
  fullName: string;
  phone: string;
  birthDate?: string | null;
  gender?: Gender | null;
  bloodType?: string | null;
  allergies?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Doctor {
  id: string;
  fullName: string;
  specialty?: string | null;
  phone?: string | null;
  active: boolean;
  clinicId: string;
}

export interface Service {
  id: string;
  code: string;
  name: string;
  price: number;
  duration?: number | null;
  active: boolean;
  clinicId: string;
}

export interface AppointmentItem {
  id: string;
  appointmentId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Appointment {
  id: string;
  appointmentNumber: string;
  clinicId: string;
  patientId: string;
  doctorId: string;
  appointmentDate: string;
  status: AppointmentStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  totalAmount: number;
  paidAmount: number;
  diagnosis?: string | null;
  prescription?: string | null;
  notes?: string | null;
  items: AppointmentItem[];
  patient: { id: string; fullName: string; phone: string; patientCode: string };
  doctor: { fullName: string; specialty?: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface TodaySummary {
  total: number;
  completed: number;
  pending: number;
  revenue: number;
}

export interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: string | null;
  lastError: string | null;
}

export interface LocalConfig {
  clinicId: string;
  clinicName: string;
  terminalId: string;
  apiUrl: string;
  lastSync: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// IPC channel type definitions
export interface ElectronAPI {
  auth: {
    login: (credentials: { phone: string; password: string }) => Promise<AuthResponse>;
    logout: () => Promise<void>;
    getProfile: () => Promise<User | null>;
    restoreSession: (token: string) => Promise<AuthResponse | null>;
    changePassword: (data: { currentPassword: string; newPassword: string }) => Promise<{ success: boolean }>;
  };
  patients: {
    getAll: (filters?: Record<string, unknown>) => Promise<Patient[]>;
    search: (query: string) => Promise<Patient[]>;
    getById: (id: string) => Promise<Patient>;
    create: (data: Omit<Patient, 'id' | 'patientCode' | 'createdAt' | 'updatedAt'>) => Promise<Patient>;
    update: (id: string, data: Partial<Patient>) => Promise<Patient>;
  };
  doctors: {
    getAll: () => Promise<Doctor[]>;
    getActive: () => Promise<Doctor[]>;
    create: (data: Omit<Doctor, 'id' | 'clinicId'>) => Promise<Doctor>;
    update: (id: string, data: Partial<Doctor>) => Promise<Doctor>;
  };
  services: {
    getAll: () => Promise<Service[]>;
    getActive: () => Promise<Service[]>;
    search: (query: string) => Promise<Service[]>;
    create: (data: Omit<Service, 'id' | 'clinicId'>) => Promise<Service>;
    update: (id: string, data: Partial<Service>) => Promise<Service>;
  };
  appointments: {
    create: (data: Partial<Appointment>) => Promise<Appointment>;
    getAll: (filters?: Record<string, unknown>) => Promise<Appointment[]>;
    getById: (id: string) => Promise<Appointment>;
    update: (id: string, data: Partial<Appointment>) => Promise<Appointment>;
    getTodaySummary: () => Promise<TodaySummary>;
    checkout: (id: string, data: { paymentMethod: PaymentMethod; amount: number }) => Promise<Appointment>;
  };
  print: {
    serviceReceipt: (appointmentId: string) => Promise<void>;
    prescription: (appointmentId: string) => Promise<void>;
  };
  sync: {
    getStatus: () => Promise<SyncStatus>;
    trigger: () => Promise<void>;
    onCompleted: (callback: (data: unknown) => void) => () => void;
    onFailed: (callback: (error: unknown) => void) => () => void;
  };
  app: {
    getVersion: () => Promise<string>;
    isOnline: () => Promise<boolean>;
    getClinicInfo: () => Promise<{ clinicId: string; clinicName: string } | null>;
    quit: () => void;
    onCloseRequested: (callback: () => void) => () => void;
    confirmClose: () => void;
  };
  config: {
    getLocalConfig: () => Promise<LocalConfig>;
    updateLocalConfig: (data: Partial<LocalConfig>) => Promise<void>;
  };
  logger: {
    error: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    info: (msg: string, ...args: unknown[]) => void;
  };
}
