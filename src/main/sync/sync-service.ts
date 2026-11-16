import { app, BrowserWindow } from 'electron';
import type { SyncStatusDto } from '../../shared/sync';
import { getPrismaClient } from '../database/sqlite-client';
import { emitEvents } from '../ipc/ipc-safe';
import { getLicenseService } from '../license/license-service';
import { log } from '../logger';
import {
  type PullAnswer,
  type PushAnswer,
  pendingCount,
  runSync,
  type SyncDb,
  SyncHttpError,
  type SyncTransport,
} from './sync-engine';

/**
 * Schedules cloud sync on the MAIN till (sync-engine.ts does the work). Every 60 s, 5 s after a
 * write, and on "sync now". Offline is normal: a failed run only records the error and the next
 * tick tries again. The till never waits for the server.
 */

export const DEFAULT_SERVER_URL = 'https://clinic.posgro.uz/api';
const EVERY_MS = 60_000;
const FIRST_RUN_MS = 15_000;
const NUDGE_MS = 5_000;
const REQUEST_TIMEOUT_MS = 30_000;

/** Packaged builds always use production; a dev build may point at staging or localhost. */
export function serverApiUrl(): string {
  const override = process.env.POSCLINIC_SERVER_URL?.trim();
  if (!app.isPackaged && override && /^(https:\/\/|http:\/\/localhost[:/])/.test(override)) {
    return override.replace(/\/+$/, '');
  }
  return DEFAULT_SERVER_URL;
}

/** The server's `server.errors.<code>` key as the till's `sync.errors.<code>`. */
function errorKey(e: unknown): string {
  if (e instanceof SyncHttpError) {
    const code = /^server\.errors\.([a-z_]+)$/.exec(e.key)?.[1];
    if (code) return `sync.errors.${code}`;
    return e.status >= 500 ? 'sync.errors.server' : 'sync.errors.unknown';
  }
  return 'sync.errors.offline';
}

function httpTransport(token: string, terminalId: string): SyncTransport {
  const base = serverApiUrl();
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `License ${token}`,
    'X-Terminal-Id': terminalId,
    'X-App-Version': app.getVersion(),
  };
  async function call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const msg = json?.message;
      throw new SyncHttpError(res.status, typeof msg === 'string' ? msg : '');
    }
    return json as T;
  }
  return {
    push: (body) => call<PushAnswer>('/sync/push', { method: 'POST', body: JSON.stringify(body) }),
    pull: (since) =>
      call<PullAnswer>(since ? `/sync/pull?since=${encodeURIComponent(since)}` : '/sync/pull', {
        method: 'GET',
      }),
  };
}

class CloudSync {
  private status: SyncStatusDto = {
    state: 'idle',
    lastSyncAt: null,
    lastError: null,
    pending: null,
  };
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nudgeTimer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    if (this.timer) return;
    setTimeout(() => void this.run(), FIRST_RUN_MS).unref?.();
    this.timer = setInterval(() => void this.run(), EVERY_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.timer = null;
  }

  /** A write happened: sync soon, once, however many writes follow. */
  nudge(): void {
    if (!this.timer) return;
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => void this.run(), NUDGE_MS);
    this.nudgeTimer.unref?.();
  }

  async getStatus(): Promise<SyncStatusDto> {
    try {
      this.status = { ...this.status, pending: await pendingCount(this.db()) };
    } catch {
      /* DB not open yet */
    }
    return this.status;
  }

  async run(): Promise<SyncStatusDto> {
    if (this.running) return this.status;
    const credential = getLicenseService().syncCredential();
    const mode = getLicenseService().tillState().mode;
    if (!credential || mode === 'setup') {
      this.set({ state: 'disabled' });
      return this.status;
    }
    this.running = true;
    this.set({ state: 'syncing' });
    try {
      const r = await runSync(this.db(), httpTransport(credential.token, credential.terminalId), {
        warn: (m) => log.warn(m),
      });
      if (r.pushed || r.pulled || r.rejected) {
        log.info(`[sync] pushed=${r.pushed} pulled=${r.pulled} rejected=${r.rejected}${r.skipped?.length ? ` waiting=${r.skipped.join(',')}` : ''}`);
      }
      // Catalog edits from the web bypass the handlers: tell open pages here and on satellites.
      if (r.pulled > 0) {
        emitEvents(
          (['services', 'doctors', 'users'] as const).map((entity) => ({
            type: 'data:changed' as const,
            entity,
          })),
        );
      }
      this.set({ state: 'idle', lastSyncAt: new Date().toISOString(), lastError: null });
    } catch (e) {
      const key = errorKey(e);
      if (key !== 'sync.errors.offline') log.warn(`[sync] failed: ${key}`);
      this.set({ state: 'error', lastError: key });
    } finally {
      this.running = false;
    }
    return this.getStatus();
  }

  private db(): SyncDb {
    return getPrismaClient() as SyncDb;
  }

  private set(patch: Partial<SyncStatusDto>): void {
    this.status = { ...this.status, ...patch };
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('sync:changed');
    }
  }
}

let instance: CloudSync | null = null;

export function getCloudSync(): CloudSync {
  if (!instance) instance = new CloudSync();
  return instance;
}
