import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@shared/types';
import { auth as authApi, type CreateClinicData } from '../api/client';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  sessionRestored: boolean;
  clinicCode: string | null;

  login: (email: string, password: string, clinicId?: string) => Promise<boolean>;

  // OTP registration flow
  requestOtp: (email: string) => Promise<boolean>;
  verifyOtp: (email: string, code: string) => Promise<{ isNewUser: boolean; registrationToken?: string }>;
  setPassword: (registrationToken: string, password: string, firstName: string, lastName: string) => Promise<string | null>;
  createClinic: (setupToken: string, data: CreateClinicData) => Promise<{ success: boolean; clinicCode?: string }>;

  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      sessionRestored: false,
      clinicCode: null,

      login: async (email, password, clinicId) => {
        set({ isLoading: true, error: null });
        try {
          const { token, user } = await authApi.login(email, password, clinicId);
          set({ user, token, isAuthenticated: true, isLoading: false, error: null });
          return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Login failed';
          set({ isLoading: false, error: msg });
          return false;
        }
      },

      requestOtp: async (email) => {
        set({ isLoading: true, error: null });
        try {
          await authApi.requestOtp(email);
          set({ isLoading: false });
          return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to send OTP';
          set({ isLoading: false, error: msg });
          return false;
        }
      },

      verifyOtp: async (email, code) => {
        set({ isLoading: true, error: null });
        try {
          const result = await authApi.verifyOtp(email, code);
          set({ isLoading: false });
          return { isNewUser: result.isNewUser, registrationToken: result.registrationToken };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Invalid OTP code';
          set({ isLoading: false, error: msg });
          return { isNewUser: false };
        }
      },

      setPassword: async (registrationToken, password, firstName, lastName) => {
        set({ isLoading: true, error: null });
        try {
          const { setupToken } = await authApi.setPassword(registrationToken, password, firstName, lastName);
          set({ isLoading: false });
          return setupToken;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to set password';
          set({ isLoading: false, error: msg });
          return null;
        }
      },

      createClinic: async (setupToken, data) => {
        set({ isLoading: true, error: null });
        try {
          const result = await authApi.createClinic(setupToken, data);
          set({
            user: result.user,
            token: result.token,
            isAuthenticated: true,
            isLoading: false,
            clinicCode: result.clinicCode,
          });
          return { success: true, clinicCode: result.clinicCode };
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to create clinic';
          set({ isLoading: false, error: msg });
          return { success: false };
        }
      },

      logout: async () => {
        try { await authApi.logout(); } catch { /* ignore */ }
        set({ user: null, token: null, isAuthenticated: false, clinicCode: null });
      },

      restoreSession: async () => {
        const { token, isAuthenticated, sessionRestored } = get();
        if (sessionRestored) return;
        set({ sessionRestored: true });

        if (token && isAuthenticated) {
          try {
            const user = await authApi.getProfile();
            if (user) {
              set({ user: user as User });
            } else {
              set({ user: null, token: null, isAuthenticated: false });
            }
          } catch {
            set({ user: null, token: null, isAuthenticated: false });
          }
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'posclinic-web-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
