import { type IpcMainInvokeEvent, ipcMain } from 'electron';
import { getLicenseService } from '../license/license-service';
import { getCloudSync } from '../sync/sync-service';

/** Strips non-cloneable values (Prisma Decimal, Date → string) before crossing IPC. */
export function ipcSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Thrown to the renderer when the licence refuses a call. `message` is an i18n key
 * (`license.refused.*`, `license.feature.*`, `license.limit.*`); Electron prefixes it with
 * "Error invoking remote method ...", so the renderer extracts it with `licenseErrorKey()`.
 */
export class LicenseRefusedError extends Error {
  constructor(key: string) {
    super(`LICENSE:${key}`);
    this.name = 'LicenseRefusedError';
  }
}

/**
 * `ipcMain.handle` with the licence gate in front. Use it for every handler; the gate decides
 * per channel (`license-core.ts` `refusal`) whether the call needs anything.
 */
export function handle<A extends unknown[], R>(
  channel: string,
  fn: (event: IpcMainInvokeEvent, ...args: A) => Promise<R> | R,
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    const refused = await getLicenseService().refusal(channel, args);
    if (refused) {
      // One place explains every refusal (renderer Layout toasts it), so pages need no
      // licence-specific error handling of their own.
      event.sender.send('license:refused', refused);
      throw new LicenseRefusedError(refused);
    }
    const result = await fn(event, ...(args as A));
    // Any write is worth sending to the cloud soon (debounced; offline is fine).
    if (WRITES.test(channel)) getCloudSync().nudge();
    return result;
  });
}

const WRITES = /:(create|update|checkout)$/;
