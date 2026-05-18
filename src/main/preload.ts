import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Authentication
  auth: {
    login: (email: string, password: string) =>
      ipcRenderer.invoke('auth:login', email, password),
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
    create: (data: unknown) => ipcRenderer.invoke('patients:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('patients:update', id, data),
  },

  // Doctors
  doctors: {
    getAll: () => ipcRenderer.invoke('doctors:getAll'),
    getActive: () => ipcRenderer.invoke('doctors:getActive'),
    create: (data: unknown) => ipcRenderer.invoke('doctors:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('doctors:update', id, data),
  },

  // Services
  services: {
    getAll: () => ipcRenderer.invoke('services:getAll'),
    getActive: () => ipcRenderer.invoke('services:getActive'),
    search: (query: string) => ipcRenderer.invoke('services:search', query),
    create: (data: unknown) => ipcRenderer.invoke('services:create', data),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('services:update', id, data),
  },

  // Appointments
  appointments: {
    create: (data: unknown) => ipcRenderer.invoke('appointments:create', data),
    getAll: (filters?: unknown) =>
      ipcRenderer.invoke('appointments:getAll', filters),
    getById: (id: string) => ipcRenderer.invoke('appointments:getById', id),
    update: (id: string, data: unknown) =>
      ipcRenderer.invoke('appointments:update', id, data),
    getTodaySummary: () => ipcRenderer.invoke('appointments:getTodaySummary'),
    checkout: (id: string, data: unknown) =>
      ipcRenderer.invoke('appointments:checkout', id, data),
  },

  // Print
  print: {
    serviceReceipt: (appointmentId: string) =>
      ipcRenderer.invoke('print:serviceReceipt', appointmentId),
    prescription: (appointmentId: string) =>
      ipcRenderer.invoke('print:prescription', appointmentId),
  },

  // Sync
  sync: {
    getStatus: () => ipcRenderer.invoke('sync:getStatus'),
    trigger: () => ipcRenderer.invoke('sync:trigger'),
    onCompleted: (callback: () => void) => {
      ipcRenderer.on('sync:completed', callback);
      return () => ipcRenderer.removeListener('sync:completed', callback);
    },
    onFailed: (callback: (error: { message: string }) => void) => {
      const handler = (_event: IpcRendererEvent, error: { message: string }) =>
        callback(error);
      ipcRenderer.on('sync:failed', handler);
      return () => ipcRenderer.removeListener('sync:failed', handler);
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

  // Config
  config: {
    getLocalConfig: () => ipcRenderer.invoke('config:getLocalConfig'),
    updateLocalConfig: (data: {
      clinicId?: string;
      apiUrl?: string;
      clinicName?: string;
      terminalId?: string;
    }) => ipcRenderer.invoke('config:updateLocalConfig', data),
  },

  // Setup wizard
  setup: {
    complete: (data: {
      clinicId: string;
      terminalId: string;
      clinicName: string;
      apiUrl: string;
      token: string;
      email: string;
      password: string;
      user: { id: string; email: string; firstName: string; lastName: string; role: string };
    }) => ipcRenderer.invoke('setup:complete', data),
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
        login: (email: string, password: string) => Promise<{ success: boolean; user?: { id: string; fullName: string; email: string; role: string; clinicId: string | null }; token?: string; error?: string }>;
        logout: () => Promise<{ success: boolean }>;
        getProfile: () => Promise<{ id: string; fullName: string; email: string; role: string; clinicId: string | null } | null>;
        restoreSession: (token: string) => Promise<{ id: string; fullName: string; email: string; role: string; clinicId: string | null } | null>;
        changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
      };
      patients: {
        getAll: (filters?: { active?: boolean }) => Promise<unknown[]>;
        search: (query: string) => Promise<unknown[]>;
        getById: (id: string) => Promise<unknown>;
        create: (data: unknown) => Promise<unknown>;
        update: (id: string, data: unknown) => Promise<unknown>;
      };
      doctors: {
        getAll: () => Promise<unknown[]>;
        getActive: () => Promise<unknown[]>;
        create: (data: unknown) => Promise<unknown>;
        update: (id: string, data: unknown) => Promise<unknown>;
      };
      services: {
        getAll: () => Promise<unknown[]>;
        getActive: () => Promise<unknown[]>;
        search: (query: string) => Promise<unknown[]>;
        create: (data: unknown) => Promise<unknown>;
        update: (id: string, data: unknown) => Promise<unknown>;
      };
      appointments: {
        create: (data: unknown) => Promise<unknown>;
        getAll: (filters?: unknown) => Promise<unknown[]>;
        getById: (id: string) => Promise<unknown>;
        update: (id: string, data: unknown) => Promise<unknown>;
        getTodaySummary: () => Promise<unknown>;
        checkout: (id: string, data: unknown) => Promise<unknown>;
      };
      print: {
        serviceReceipt: (appointmentId: string) => Promise<{ success: boolean; error?: string }>;
        prescription: (appointmentId: string) => Promise<{ success: boolean; error?: string }>;
      };
      sync: {
        getStatus: () => Promise<unknown>;
        trigger: () => Promise<void>;
        onCompleted: (callback: () => void) => () => void;
        onFailed: (callback: (error: { message: string }) => void) => () => void;
      };
      app: {
        getVersion: () => Promise<string>;
        isOnline: () => Promise<boolean>;
        getClinicInfo: () => Promise<{ clinicId: string; clinicName: string } | null>;
        quit: () => Promise<void>;
        onCloseRequested: (callback: () => void) => () => void;
        confirmClose: () => void;
      };
      config: {
        getLocalConfig: () => Promise<{ clinicId: string; apiUrl: string; clinicName: string; terminalId: string } | null>;
        updateLocalConfig: (data: { clinicId?: string; apiUrl?: string; clinicName?: string; terminalId?: string }) => Promise<{ requiresRestart?: boolean }>;
      };
      setup: {
        complete: (data: { clinicId: string; terminalId: string; clinicName: string; apiUrl: string; token: string; email: string; password: string; user: { id: string; email: string; firstName: string; lastName: string; role: string } }) => Promise<{ success: boolean; error?: string }>;
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
