import os from 'node:os';
import { app, BrowserWindow, ipcMain, net, safeStorage } from 'electron';
import { updateConfig } from './config/app-config';
import { getPrismaClient, initializeDatabase, readClinicBootstrap } from './database/sqlite-client';
import { freshActor } from './ipc/auth-handlers';
import { bindIpc, broadcast, sendToWindows } from './ipc/dispatch';
import { setupIpcHandlers } from './ipc/handlers';
import { configureHandlers, handle, hasHandler, invokeHandler } from './ipc/ipc-safe';
import { setupLanHandlers } from './ipc/lan-handlers';
import { setupLicenseHandlers } from './ipc/license-handlers';
import { type Cipher, plainCipher } from './lan/config';
import { LanService } from './lan/lan-service';
import { setupSyncHandlers } from './ipc/sync-handlers';
import { setupUpdateHandlers } from './ipc/update-handlers';
import { getLicenseService } from './license/license-service';
import { log } from './logger';
import { getCloudSync } from './sync/sync-service';
import { createSetupWindow, createWindow } from './window';

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch {}

let mainWindow: BrowserWindow | null = null;
let setupWindow: BrowserWindow | null = null;
let lan: LanService | null = null;

/**
 * A satellite's device secret is kept encrypted with this OS user's key (safeStorage: DPAPI on
 * Windows); a machine without it keeps it as is in its local database.
 */
function machineCipher(): Cipher {
  if (!safeStorage.isEncryptionAvailable()) {
    log.warn('[lan] no OS keychain: a satellite credential would be stored unencrypted');
    return plainCipher;
  }
  return {
    name: 'safe',
    encrypt: (s) => safeStorage.encryptString(s).toString('base64'),
    decrypt: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')),
  };
}

function createLanService(): LanService {
  return new LanService({
    getDb: () => getPrismaClient(),
    version: app.getVersion(),
    machineName: os.hostname().slice(0, 60),
    cipher: machineCipher(),
    handlers: { hasHandler, invoke: invokeHandler, freshActor },
    // The licence counts tills: the main one plus its satellites.
    deviceLimit: () => {
      // A development run may allow satellites the licence does not; never an installed one.
      const override = process.env.POSCLINIC_LAN_DEVICES;
      if (!app.isPackaged && override && /^\d+$/.test(override)) return Number(override);
      const tills = getLicenseService().terminalLimit();
      return tills === null ? null : Math.max(0, tills - 1);
    },
    onLanChanged: () => sendToWindows('lan:changed'),
    onMainEvent: (event) => sendToWindows(event.type, event),
    allowLoopback: !app.isPackaged,
    restart: () => {
      setTimeout(() => {
        app.relaunch();
        app.quit();
      }, 400);
    },
    log: (message, error) => (error ? log.warn(message, error) : log.info(message)),
  });
}

function registerCoreHandlers(): void {
  handle('app:getVersion', () => app.getVersion());

  handle('app:isOnline', () => net.isOnline());

  handle('app:getClinicInfo', async () => {
    if (lan?.isSatellite) return lan.linkedClinic();
    try {
      const config = await getPrismaClient().localConfig.findUnique({ where: { id: 'config' } });
      if (!config) return null;
      return { clinicId: config.clinicId, clinicName: config.clinicName };
    } catch {
      return null;
    }
  });

  handle('app:quit', () => {
    app.quit();
  });

  handle('config:getLocalConfig', async () => {
    try {
      return await getPrismaClient().localConfig.findUnique({ where: { id: 'config' } });
    } catch {
      return null;
    }
  });

  handle('setup:launchApp', async () => {
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
  if (lan?.isSatellite) {
    // A satellite checks in nowhere: its main till's licence gates every call, and only the
    // main till syncs to the cloud.
    log.info('[bootstrap] satellite till: every call goes to the main till');
    mainWindow = createWindow();
    return;
  }
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
  getCloudSync().start();
}

/**
 * A main till is set up once it holds a valid licence for the bootstrapped clinic and has a
 * user. A satellite is set up once it is paired (lan_link); it holds no licence of its own.
 */
async function isSetUp(): Promise<boolean> {
  if (lan?.isSatellite) return true;
  const license = getLicenseService();
  const clinicId = readClinicBootstrap();
  if (!clinicId || !license.isLinked() || license.linkedStoreId() !== clinicId) return false;
  try {
    return (await getPrismaClient().user.count()) > 0;
  } catch {
    return false;
  }
}

/** Joining a main till is for a till that is not a clinic till of its own yet. */
async function isSetUpAsMain(): Promise<boolean> {
  if (getLicenseService().isLinked()) return true;
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

    lan = createLanService();
    setupIpcHandlers();
    setupLicenseHandlers();
    setupUpdateHandlers();
    setupSyncHandlers();
    setupLanHandlers(lan, isSetUpAsMain);
    registerCoreHandlers();
    configureHandlers({
      gate: (channel, args) => getLicenseService().refusal(channel, args),
      openCase: () => getLicenseService().refusal('cases:open', []),
      onWrite: () => getCloudSync().nudge(),
      emit: broadcast,
    });
    bindIpc(lan);
    // A main till may serve satellites; a satellite starts following its main till.
    await lan.init();

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
    getCloudSync().stop();
    void lan?.stop();
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
  getCloudSync().stop();
  void lan?.stop();
});

export { mainWindow };
