import { app, BrowserWindow, ipcMain, net } from 'electron';
import bcrypt from 'bcryptjs';
import { createWindow, createSetupWindow } from './window';
import { setupIpcHandlers } from './ipc/handlers';
import { SyncService } from './sync/sync-service';
import {
  initializeDatabase,
  readClinicBootstrap,
  writeClinicBootstrap,
  reinitializeDatabaseForClinic,
  getPrismaClient,
} from './database/sqlite-client';
import { getAppConfig, updateConfig } from './config/app-config';
import { log } from './logger';

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch {}

let mainWindow: BrowserWindow | null = null;
let setupWindow: BrowserWindow | null = null;
let syncService: SyncService | null = null;

function registerCoreHandlers(): void {
  ipcMain.handle('sync:getStatus', () => {
    const config = getAppConfig();
    return {
      ...(syncService?.getStatus() ?? {
        isSyncing: false,
        lastSyncTime: null,
        lastError: null,
      }),
      vpsApiUrl: config.vpsApiUrl,
    };
  });

  ipcMain.handle('sync:trigger', async () => {
    await syncService?.triggerSync();
  });

  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('app:isOnline', () => net.isOnline());

  ipcMain.handle('app:getClinicInfo', async () => {
    try {
      const prisma = getPrismaClient();
      const config = await prisma.localConfig.findUnique({ where: { id: 'config' } });
      if (!config) return null;
      return { clinicId: config.clinicId, clinicName: config.clinicName };
    } catch {
      return null;
    }
  });

  ipcMain.handle('app:quit', () => {
    app.quit();
  });

  ipcMain.handle('config:getLocalConfig', async () => {
    try {
      const prisma = getPrismaClient();
      return await prisma.localConfig.findUnique({ where: { id: 'config' } });
    } catch {
      return null;
    }
  });

  ipcMain.handle('config:updateLocalConfig', async (_event, data: {
    clinicId?: string;
    apiUrl?: string;
    clinicName?: string;
    terminalId?: string;
  }) => {
    try {
      const prisma = getPrismaClient();
      const existing = await prisma.localConfig.findUnique({ where: { id: 'config' } });
      if (existing) {
        await prisma.localConfig.update({
          where: { id: 'config' },
          data: {
            clinicId: data.clinicId ?? existing.clinicId,
            clinicName: data.clinicName ?? existing.clinicName,
            terminalId: data.terminalId ?? existing.terminalId,
            apiUrl: data.apiUrl ?? existing.apiUrl,
          },
        });
      } else {
        await prisma.localConfig.create({
          data: {
            id: 'config',
            clinicId: data.clinicId ?? '',
            clinicName: data.clinicName ?? 'Clinic',
            terminalId: data.terminalId ?? 'T1',
            apiUrl: data.apiUrl ?? '',
          },
        });
      }
      if (data.clinicId) updateConfig({ clinicId: data.clinicId });
      if (data.clinicName) updateConfig({ clinicName: data.clinicName });
      if (data.terminalId) updateConfig({ terminalId: data.terminalId });
      if (data.apiUrl) updateConfig({ vpsApiUrl: data.apiUrl });
      return { requiresRestart: false };
    } catch (error) {
      log.error('[config:updateLocalConfig]', error);
      throw error;
    }
  });

  ipcMain.handle('setup:complete', async (_event, data: {
    clinicId: string;
    terminalId: string;
    clinicName: string;
    apiUrl: string;
    token: string;
    email: string;
    password: string;
    user: { id: string; email: string; firstName: string; lastName: string; role: string };
  }) => {
    try {
      writeClinicBootstrap(data.clinicId);

      // Switch the DB connection to the clinic-specific file now
      await reinitializeDatabaseForClinic(data.clinicId);
      const clinicPrisma = getPrismaClient();

      // Write config to the clinic-specific DB (used on all subsequent startups)
      await clinicPrisma.localConfig.upsert({
        where: { id: 'config' },
        update: {
          clinicId: data.clinicId,
          clinicName: data.clinicName,
          terminalId: data.terminalId,
          apiUrl: data.apiUrl,
        },
        create: {
          id: 'config',
          clinicId: data.clinicId,
          clinicName: data.clinicName,
          terminalId: data.terminalId,
          apiUrl: data.apiUrl,
        },
      });

      // Create the local admin user so they can log in offline
      const passwordHash = await bcrypt.hash(data.password, 10);
      const fullName = `${data.user.firstName} ${data.user.lastName}`.trim();
      await clinicPrisma.$executeRaw`
        INSERT OR REPLACE INTO users (id, email, password, role, full_name, active, clinic_id, created_at, updated_at)
        VALUES (${data.user.id}, ${data.email}, ${passwordHash}, ${data.user.role}, ${fullName}, 1, ${data.clinicId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `;

      updateConfig({
        clinicId: data.clinicId,
        clinicName: data.clinicName,
        terminalId: data.terminalId,
        vpsApiUrl: data.apiUrl,
      });

      if (syncService) {
        syncService.setToken(data.token);
      }

      return { success: true };
    } catch (error) {
      log.error('[setup:complete]', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('setup:launchApp', async () => {
    await launchMainApp();
    if (setupWindow && !setupWindow.isDestroyed()) {
      setupWindow.close();
    }
  });

  // Logger from renderer
  ipcMain.on('log:renderer', (_event, level: string, msg: string) => {
    if (level === 'error') log.error(msg);
    else if (level === 'warn') log.warn(msg);
    else log.info(msg);
  });
}

async function launchMainApp(): Promise<void> {
  const prisma = getPrismaClient();
  const localConfig = await prisma.localConfig.findUnique({ where: { id: 'config' } });

  if (localConfig) {
    updateConfig({
      terminalId: localConfig.terminalId,
      clinicId: localConfig.clinicId,
      vpsApiUrl: localConfig.apiUrl,
      clinicName: localConfig.clinicName,
    });
    log.info(`[bootstrap] Loaded config: terminalId=${localConfig.terminalId} clinicId=${localConfig.clinicId}`);
  }

  mainWindow = createWindow();

  syncService = new SyncService();
  syncService.start();
}

async function bootstrap() {
  try {
    await initializeDatabase();

    setupIpcHandlers();
    registerCoreHandlers();

    process.on('unhandledRejection', (reason, promise) => {
      log.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
    process.on('uncaughtException', (error) => {
      log.error('Uncaught Exception:', error);
    });

    log.info('[bootstrap] POSCLINIC started', {
      version: app.getVersion(),
      platform: process.platform,
    });

    const bootstrapClinicId = readClinicBootstrap();

    if (!bootstrapClinicId) {
      log.info('[bootstrap] No clinic configured — launching setup wizard');
      syncService = new SyncService();
      setupWindow = createSetupWindow();
      return;
    }

    await launchMainApp();
  } catch (error) {
    console.error('Failed to start application:', error);
    app.quit();
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = mainWindow ?? setupWindow;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    syncService?.stop();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
  }
});

app.on('before-quit', () => {
  syncService?.stop();
});

export { mainWindow };
