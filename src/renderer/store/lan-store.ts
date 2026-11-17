import { create } from 'zustand';
import type { LanLinkDto } from '../../shared/lan';

/**
 * This till's LAN role and, on a satellite, its line to the main till (main reports it; the
 * "waiting for the main till" overlay and Settings follow it).
 */
interface LanState {
  link: LanLinkDto | null;
  refresh: () => Promise<void>;
}

export const useLanStore = create<LanState>()((set) => ({
  link: null,
  refresh: async () => {
    try {
      set({ link: await window.electronAPI.lan.link() });
    } catch {
      /* keep the last known link */
    }
  },
}));

let subscribed = false;
/** Starts following `lan:changed` once per window. */
export function followLan(): void {
  if (subscribed) return;
  subscribed = true;
  const { refresh } = useLanStore.getState();
  void refresh();
  window.electronAPI.lan.onChanged(() => void refresh());
}

export const useIsSatellite = () => useLanStore((s) => s.link?.role === 'satellite');

/**
 * The i18n key in an IPC error: Electron reports a main-process throw as
 * "Error invoking remote method 'x': Error: lan.errors.codeWrong".
 */
/**
 * What to show for a refusal: its i18n key translated, or (REGOS:VCR's own reason, which comes as
 * text, v2.6) the message itself without Electron's "Error invoking remote method" prefix.
 */
export function ipcErrorText(error: unknown, t: (key: string) => string): string {
  const key = ipcErrorKey(error, '');
  if (key) return t(key);
  const text = error instanceof Error ? error.message : String(error ?? '');
  const plain = text
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^\w*Error:\s*/, '');
  return plain.trim() || t('common.error');
}

export function ipcErrorKey(error: unknown, fallback = 'errors.unknownError'): string {
  const text = error instanceof Error ? error.message : String(error ?? '');
  const m = /((?:lan\.errors|errors|license\.(?:refused|feature|limit))\.[A-Za-z_.-]+)\s*$/.exec(
    text.replace(/^.*LICENSE:/, ''),
  );
  return m?.[1] ?? fallback;
}
