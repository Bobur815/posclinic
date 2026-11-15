import { create } from 'zustand';
import type { LicenseFeature, LicenseStatusDto } from '../../shared/license';

/**
 * The till's licence as main reports it. Display only: main enforces every rule itself
 * (src/main/license/license-core.ts), so hiding a control here is a courtesy, never the gate.
 */
interface LicenseState {
  status: LicenseStatusDto | null;
  checking: boolean;
  refresh: () => Promise<void>;
  checkNow: () => Promise<LicenseStatusDto | null>;
}

export const useLicenseStore = create<LicenseState>()((set) => ({
  status: null,
  checking: false,
  refresh: async () => {
    try {
      set({ status: await window.electronAPI.license.status() });
    } catch {
      /* keep the last known status */
    }
  },
  checkNow: async () => {
    set({ checking: true });
    try {
      const status = await window.electronAPI.license.checkNow();
      set({ status });
      return status;
    } catch {
      return null;
    } finally {
      set({ checking: false });
    }
  },
}));

/** Whether the plan includes `feature`. Unknown status (still loading) shows the control. */
export function useLicensed(feature: LicenseFeature): boolean {
  return useLicenseStore((s) => !s.status || s.status.features.includes(feature));
}
