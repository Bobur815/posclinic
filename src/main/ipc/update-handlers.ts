import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { closeDatabase } from '../database/sqlite-client';
import { getLicenseService } from '../license/license-service';
import { log } from '../logger';
import { createUpdater, UPDATE_FEED_URL, type UpdaterEngine } from '../updater/updater';
import { handle, isAdmin } from './ipc-safe';

/** One quiet check this long after start, so the clinic opens first. */
const STARTUP_CHECK_MS = 30_000;

/**
 * Software update over IPC. Anyone signed in may see the status; only a clinic admin may
 * download and install (an install restarts the app, never in the middle of a visit).
 */
export function setupUpdateHandlers(): void {
  const updater = createUpdater({
    currentVersion: app.getVersion(),
    // The NSIS build only: dev and unpacked runs have no app-update.yml and nothing to replace.
    supported: app.isPackaged && process.platform === 'win32',
    // autoUpdater is created on first access, so a dev run never builds one.
    engine: () => {
      autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_FEED_URL });
      autoUpdater.logger = log;
      return autoUpdater as unknown as UpdaterEngine;
    },
    onChange: () => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('update:changed');
      }
    },
    // Only release the database and the licence clock: quitAndInstall then quits the app itself.
    beforeInstall: async () => {
      getLicenseService().stop();
      await closeDatabase();
    },
    log: {
      info: (m) => log.info(m),
      warn: (m, e) => log.warn(m, e),
    },
  });

  // Per machine: a satellite updates itself (dispatch.ts runs update:* locally there, with the
  // actor its main till reports for the window).
  handle('update:status', () => updater.status());
  handle('update:check', () => updater.check());
  handle('update:download', (ctx) => (isAdmin(ctx) ? updater.download() : updater.status()));
  handle('update:install', async (ctx) => {
    if (isAdmin(ctx)) await updater.install();
  });

  setTimeout(() => void updater.check({ quiet: true }), STARTUP_CHECK_MS).unref?.();
}
