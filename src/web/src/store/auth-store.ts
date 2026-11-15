import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { normalizePhone } from '@shared/phone';
import {
  ApiError,
  AUTH_STORAGE_KEY,
  authApi,
  setUnauthorizedHandler,
  type AuthUser,
  type ClinicInfo,
} from '../api/client';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  clinic: ClinicInfo | null;
  isLoading: boolean;
  /** i18n error code (`errors.<code>`), or null. */
  error: string | null;
  sessionRestored: boolean;

  login: (phone: string, password: string) => Promise<boolean>;
  logout: () => void;
  restoreSession: () => Promise<void>;
  setClinic: (clinic: ClinicInfo) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      clinic: null,
      isLoading: false,
      error: null,
      sessionRestored: false,

      login: async (rawPhone, password) => {
        const phone = normalizePhone(rawPhone);
        if (!phone) {
          set({ error: 'invalid_phone' });
          return false;
        }
        set({ isLoading: true, error: null });
        try {
          const { token, user, clinic } = await authApi.login(phone, password);
          set({ token, user, clinic, isLoading: false });
          return true;
        } catch (err) {
          set({ isLoading: false, error: err instanceof ApiError ? err.code : 'generic' });
          return false;
        }
      },

      logout: () => set({ token: null, user: null, clinic: null }),

      restoreSession: async () => {
        if (get().sessionRestored) return;
        set({ sessionRestored: true });
        if (!get().token) return;
        try {
          const user = await authApi.profile();
          set({ user });
        } catch (err) {
          // Offline: keep the session; anything else (401 handled globally) clears it.
          if (!(err instanceof ApiError && err.code === 'network')) get().logout();
        }
      },

      setClinic: (clinic) => set({ clinic }),
      clearError: () => set({ error: null }),
    }),
    {
      name: AUTH_STORAGE_KEY,
      partialize: (s) => ({ token: s.token, user: s.user, clinic: s.clinic }),
    },
  ),
);

setUnauthorizedHandler(() => useAuthStore.getState().logout());

export const isSignedIn = (s: AuthState) => Boolean(s.token && s.user);
