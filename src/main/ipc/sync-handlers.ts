import { ipcMain } from 'electron';
import { getCloudSync } from '../sync/sync-service';

/** Cloud sync status and "sync now" (Settings → Cloud sync). */
export function setupSyncHandlers(): void {
  ipcMain.handle('sync:status', () => getCloudSync().getStatus());
  ipcMain.handle('sync:now', () => getCloudSync().run());
}
