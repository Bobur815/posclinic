import { getCloudSync } from '../sync/sync-service';
import { handle } from './ipc-safe';

/** Cloud sync status and "sync now" (Settings → Cloud sync; main till only). */
export function setupSyncHandlers(): void {
  handle('sync:status', () => getCloudSync().getStatus());
  handle('sync:now', () => getCloudSync().run());
}
