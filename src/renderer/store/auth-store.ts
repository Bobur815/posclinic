import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'SUPER_ADMIN' | 'CLINIC_ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'NURSE';

export interface User {
  id: string;
  fullName: string;
  /** Login identity, `+998XXXXXXXXX`. */
  phone: string;
  email: string | null;
  role: UserRole;
  clinicId: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;
  sessionRestored: boolean;

  login: (user: User, token: string) => void;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      token: null,
      sessionRestored: false,

      login: (user: User, token: string) => {
        set({ user, isAuthenticated: true, token, sessionRestored: true });
      },

      logout: async () => {
        try {
          await window.electronAPI.auth.logout();
        } catch { /* ignore */ }
        set({ user: null, isAuthenticated: false, token: null, sessionRestored: true });
      },

      restoreSession: async () => {
        const { token, sessionRestored } = get();
        if (sessionRestored) return;

        if (!token) {
          set({ sessionRestored: true });
          return;
        }

        try {
          const user = await window.electronAPI.auth.restoreSession(token);
          if (user) {
            set({ user: user as User, isAuthenticated: true, sessionRestored: true });
          } else {
            set({ user: null, isAuthenticated: false, token: null, sessionRestored: true });
          }
        } catch {
          set({ user: null, isAuthenticated: false, token: null, sessionRestored: true });
        }
      },
    }),
    {
      name: 'posclinic-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
