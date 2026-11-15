import { contextBridge, ipcRenderer } from 'electron';
import type { ActivateResult, LicenseStatusDto } from '../shared/license';
import type { SyncStatusDto } from '../shared/sync';
import type { UpdateStatusDto } from '../shared/update';
import type { DataChangedEvent, LanJoinInput, LanLinkDto, LanStatusDto } from '../shared/lan';
import type {
  AppointmentCreateInput,
  AppointmentDto,
  AppointmentFilters,
  AppointmentUpdateInput,
  CheckoutInput,
  DoctorDto,
  DoctorInput,
  PatientDto,
  PatientInput,
  PatientWithVisitsDto,
  ServiceDto,
  ServiceInput,
  TodaySummaryDto,
} from '../shared/clinic';

interface SetupAdminInput {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  lang: 'uz' | 'ru';
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication
  auth: {
    login: (phone: string, password: string) =>
      ipcRenderer.invoke('auth:login', phone, password),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getProfile: () => ipcRenderer.invoke('auth:getProfile'),
    restoreSession: (token: string) =>
      ipcRenderer.invoke('auth:restoreSession', token),
    changePassword: (currentPassword: string, newPassword: string) =>
      ipcRenderer.invoke('auth:changePassword', currentPassword, newPassword),
  },

  // Patients
  patients: {
    getAll: (filters?: { active?: boolean }) =>
      ipcRenderer.invoke('patients:getAll', filters),
    search: (query: string) => ipcRenderer.invoke('patients:search', query),
    getById: (id: string) => ipcRenderer.invoke('patients:getById', id),
    create: (data: PatientInput) => ipcRenderer.invoke('patients:create', data),
    update: (id: string, data: PatientInput) =>
      ipcRenderer.invoke('patients:update', id, data),
  },

  // Doctors
  doctors: {
    getAll: () => ipcRenderer.invoke('doctors:getAll'),
    getActive: () => ipcRenderer.invoke('doctors:getActive'),
    create: (data: DoctorInput) => ipcRenderer.invoke('doctors:create', data),
    update: (id: string, data: DoctorInput) =>
      ipcRenderer.invoke('doctors:update', id, data),
  },

  // Services
  services: {
    getAll: () => ipcRenderer.invoke('services:getAll'),
    getActive: () => ipcRenderer.invoke('services:getActive'),
    search: (query: string) => ipcRenderer.invoke('services:search', query),
    create: (data: ServiceInput) => ipcRenderer.invoke('services:create', data),
    update: (id: string, data: ServiceInput) =>
      ipcRenderer.invoke('services:update', id, data),
  },

  // Appointments
  appointments: {
    create: (data: AppointmentCreateInput) => ipcRenderer.invoke('appointments:create', data),
    getAll: (filters?: AppointmentFilters) =>
      ipcRenderer.invoke('appointments:getAll', filters),
    getById: (id: string) => ipcRenderer.invoke('appointments:getById', id),
    update: (id: string, data: AppointmentUpdateInput) =>
      ipcRenderer.invoke('appointments:update', id, data),
    getTodaySummary: () => ipcRenderer.invoke('appointments:getTodaySummary'),
    checkout: (id: string, data: CheckoutInput) =>
      ipcRenderer.invoke('appointments:checkout', id, data),
  },

  // Print
  print: {
    serviceReceipt: (appointmentId: string) =>
      ipcRenderer.invoke('print:serviceReceipt', appointmentId),
    prescription: (appointmentId: string) =>
      ipcRenderer.invoke('print:prescription', appointmentId),
  },

  // Licence (posgro). The renderer only reads status; main enforces it on every call.
  license: {
    status: () => ipcRenderer.invoke('license:status'),
    checkNow: () => ipcRenderer.invoke('license:checkNow'),
    activate: (phone: string, code: string) =>
      ipcRenderer.invoke('license:activate', phone, code),
    onChanged: (callback: () => void) => {
      ipcRenderer.on('license:changed', callback);
      return () => ipcRenderer.removeListener('license:changed', callback);
    },
    /** Main refused a call; `key` is an i18n key. */
    onRefused: (callback: (key: string) => void) => {
      const handler = (_e: unknown, key: string) => callback(key);
      ipcRenderer.on('license:refused', handler);
      return () => ipcRenderer.removeListener('license:refused', handler);
    },
  },

  // App
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    isOnline: (): Promise<boolean> => ipcRenderer.invoke('app:isOnline'),
    getClinicInfo: () => ipcRenderer.invoke('app:getClinicInfo'),
    quit: () => ipcRenderer.invoke('app:quit'),
    onCloseRequested: (callback: () => void) => {
      ipcRenderer.on('app:close-requested', callback);
      return () => ipcRenderer.removeListener('app:close-requested', callback);
    },
    confirmClose: () => ipcRenderer.send('app:confirm-close'),
  },

  // Cloud sync to the posclinic server (main till only).
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    now: () => ipcRenderer.invoke('sync:now'),
    onChanged: (callback: () => void) => {
      ipcRenderer.on('sync:changed', callback);
      return () => ipcRenderer.removeListener('sync:changed', callback);
    },
  },

  // Software update (feed: panel.posgro.uz/releases/posclinic). Download/install: admins only.
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onChanged: (callback: () => void) => {
      ipcRenderer.on('update:changed', callback);
      return () => ipcRenderer.removeListener('update:changed', callback);
    },
  },

  // Satellite tills on the clinic LAN (main: settings; satellite: its link to the main till).
  lan: {
    status: () => ipcRenderer.invoke('lan:status'),
    update: (input: { enabled?: boolean; port?: number }) =>
      ipcRenderer.invoke('lan:update', input),
    issueCode: () => ipcRenderer.invoke('lan:issueCode'),
    cancelCode: () => ipcRenderer.invoke('lan:cancelCode'),
    revoke: (deviceId: string) => ipcRenderer.invoke('lan:revoke', deviceId),
    link: () => ipcRenderer.invoke('lan:link'),
    join: (input: LanJoinInput) => ipcRenderer.invoke('lan:join', input),
    leave: () => ipcRenderer.invoke('lan:leave'),
    onChanged: (callback: () => void) => {
      ipcRenderer.on('lan:changed', callback);
      return () => ipcRenderer.removeListener('lan:changed', callback);
    },
  },

  // Something changed on the main till (this window, another window, or a satellite).
  data: {
    onChanged: (callback: (event: DataChangedEvent) => void) => {
      const handler = (_e: unknown, event: DataChangedEvent) => callback(event);
      ipcRenderer.on('data:changed', handler);
      return () => ipcRenderer.removeListener('data:changed', handler);
    },
  },

  // Config
  config: {
    getLocalConfig: () => ipcRenderer.invoke('config:getLocalConfig'),
  },

  // Setup wizard
  setup: {
    createAdmin: (data: SetupAdminInput) => ipcRenderer.invoke('setup:createAdmin', data),
    launchApp: () => ipcRenderer.invoke('setup:launchApp'),
  },

  // Logger
  logger: {
    error: (msg: string) => ipcRenderer.send('log:renderer', 'error', msg),
    warn: (msg: string) => ipcRenderer.send('log:renderer', 'warn', msg),
    info: (msg: string) => ipcRenderer.send('log:renderer', 'info', msg),
  },
});

declare global {
  interface Window {
    electronAPI: {
      auth: {
        login: (phone: string, password: string) => Promise<{ success: boolean; user?: { id: string; fullName: string; phone: string; email: string | null; role: string; clinicId: string | null }; token?: string; error?: string }>;
        logout: () => Promise<{ success: boolean }>;
        getProfile: () => Promise<{ id: string; fullName: string; phone: string; email: string | null; role: string; clinicId: string | null } | null>;
        restoreSession: (token: string) => Promise<{ id: string; fullName: string; phone: string; email: string | null; role: string; clinicId: string | null } | null>;
        changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
      };
      patients: {
        getAll: (filters?: { active?: boolean }) => Promise<PatientDto[]>;
        search: (query: string) => Promise<PatientDto[]>;
        getById: (id: string) => Promise<PatientWithVisitsDto | null>;
        create: (data: PatientInput) => Promise<PatientDto>;
        update: (id: string, data: PatientInput) => Promise<PatientDto>;
      };
      doctors: {
        getAll: () => Promise<DoctorDto[]>;
        getActive: () => Promise<DoctorDto[]>;
        create: (data: DoctorInput) => Promise<DoctorDto>;
        update: (id: string, data: DoctorInput) => Promise<DoctorDto>;
      };
      services: {
        getAll: () => Promise<ServiceDto[]>;
        getActive: () => Promise<ServiceDto[]>;
        search: (query: string) => Promise<ServiceDto[]>;
        create: (data: ServiceInput) => Promise<ServiceDto>;
        update: (id: string, data: ServiceInput) => Promise<ServiceDto>;
      };
      appointments: {
        create: (data: AppointmentCreateInput) => Promise<AppointmentDto>;
        getAll: (filters?: AppointmentFilters) => Promise<AppointmentDto[]>;
        getById: (id: string) => Promise<AppointmentDto | null>;
        update: (id: string, data: AppointmentUpdateInput) => Promise<AppointmentDto>;
        getTodaySummary: () => Promise<TodaySummaryDto>;
        checkout: (id: string, data: CheckoutInput) => Promise<AppointmentDto>;
      };
      print: {
        serviceReceipt: (appointmentId: string) => Promise<{ success: boolean; error?: string }>;
        prescription: (appointmentId: string) => Promise<{ success: boolean; error?: string }>;
      };
      license: {
        status: () => Promise<LicenseStatusDto>;
        checkNow: () => Promise<LicenseStatusDto>;
        activate: (phone: string, code: string) => Promise<ActivateResult>;
        onChanged: (callback: () => void) => () => void;
        onRefused: (callback: (key: string) => void) => () => void;
      };
      app: {
        getVersion: () => Promise<string>;
        isOnline: () => Promise<boolean>;
        getClinicInfo: () => Promise<{ clinicId: string; clinicName: string } | null>;
        quit: () => Promise<void>;
        onCloseRequested: (callback: () => void) => () => void;
        confirmClose: () => void;
      };
      sync: {
        status: () => Promise<SyncStatusDto>;
        now: () => Promise<SyncStatusDto>;
        onChanged: (callback: () => void) => () => void;
      };
      update: {
        status: () => Promise<UpdateStatusDto>;
        check: () => Promise<UpdateStatusDto>;
        download: () => Promise<UpdateStatusDto>;
        install: () => Promise<void>;
        onChanged: (callback: () => void) => () => void;
      };
      lan: {
        status: () => Promise<LanStatusDto>;
        update: (input: { enabled?: boolean; port?: number }) => Promise<LanStatusDto>;
        issueCode: () => Promise<LanStatusDto>;
        cancelCode: () => Promise<LanStatusDto>;
        revoke: (deviceId: string) => Promise<LanStatusDto>;
        link: () => Promise<LanLinkDto>;
        join: (input: LanJoinInput) => Promise<LanLinkDto>;
        leave: () => Promise<LanLinkDto>;
        onChanged: (callback: () => void) => () => void;
      };
      data: {
        onChanged: (callback: (event: DataChangedEvent) => void) => () => void;
      };
      config: {
        getLocalConfig: () => Promise<{ clinicId: string; apiUrl: string; clinicName: string; terminalId: string } | null>;
      };
      setup: {
        createAdmin: (data: SetupAdminInput) => Promise<{ success: boolean; error?: string }>;
        launchApp: () => Promise<void>;
      };
      logger: {
        error: (msg: string) => void;
        warn: (msg: string) => void;
        info: (msg: string) => void;
      };
    };
  }
}
