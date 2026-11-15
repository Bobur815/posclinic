import { app, BrowserWindow, ipcMain, net } from 'electron';
import { updateConfig } from './config/app-config';
import { getPrismaClient, initializeDatabase, readClinicBootstrap } from './database/sqlite-client';
import { setupIpcHandlers } from './ipc/handlers';
import { setupLicenseHandlers } from './ipc/license-handlers';
import { setupUpdateHandlers } from './ipc/update-handlers';
import { getLicenseService } from './license/license-service';
import { log } from './logger';
import { createSetupWindow, createWindow } from './window';

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch {}

let mainWindow: BrowserWindow | null = null;
let setupWindow: BrowserWindow | null = null;

function registerCoreHandlers(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('app:isOnline', () => net.isOnline());

  ipcMain.handle('app:getClinicInfo', async () => {
    try {
      const config = await getPrismaClient().localConfig.findUnique({ where: { id: 'config' } });
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
      return await getPrismaClient().localConfig.findUnique({ where: { id: 'config' } });
    } catch {
      return null;
    }
  });

  ipcMain.handle('setup:launchApp', async () => {
    if (mainWindow || !(await isSetUp())) return;
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
  const localConfig = await getPrismaClient().localConfig.findUnique({ where: { id: 'config' } });

  if (localConfig) {
    updateConfig({
      terminalId: localConfig.terminalId,
      clinicId: localConfig.clinicId,
      clinicName: localConfig.clinicName,
    });
    log.info(`[bootstrap] clinic=${localConfig.clinicId} terminal=${localConfig.terminalId}`);
  }

  mainWindow = createWindow();
  getLicenseService().startBackground();
}

/** A till is set up once it holds a valid licence for the bootstrapped clinic and has a user. */
async function isSetUp(): Promise<boolean> {
  const license = getLicenseService();
  const clinicId = readClinicBootstrap();
  if (!clinicId || !license.isLinked() || license.linkedStoreId() !== clinicId) return false;
  try {
    return (await getPrismaClient().user.count()) > 0;
  } catch {
    return false;
  }
}

async function bootstrap() {
  try {
    await getLicenseService().init();
    await initializeDatabase();

    setupIpcHandlers();
    setupLicenseHandlers();
    setupUpdateHandlers();
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

    if (!(await isSetUp())) {
      log.info('[bootstrap] Not linked or no admin yet: launching setup wizard');
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
    getLicenseService().stop();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
  }
});

app.on('before-quit', () => {
  getLicenseService().stop();
});

export { mainWindow };
