import { BrowserWindow, screen, Menu, globalShortcut, ipcMain, app } from 'electron';
import path from 'path';
import { effectiveScale, readUiScale, type UiScaleChoice, writeUiScale } from './ui-scale';

const iconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'icons', 'posclinic-icon.ico')
  : path.join(__dirname, '../../build/icons/posclinic-icon.ico');

export function createSetupWindow(): BrowserWindow {
  const setupWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    center: true,
    resizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: !app.isPackaged,
    },
    show: false,
    title: 'POSCLINIC - Setup',
    icon: iconPath,
    autoHideMenuBar: true,
  });

  setupWindow.once('ready-to-show', () => {
    setupWindow.show();
    setupWindow.focus();
  });

  if (!app.isPackaged) globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (!setupWindow.isDestroyed()) setupWindow.webContents.toggleDevTools();
  });

  setupWindow.on('closed', () => {
    globalShortcut.unregister('CommandOrControl+Shift+I');
  });

  if (process.env.NODE_ENV === 'development') {
    setupWindow.loadURL('http://localhost:5175/#/setup');
  } else {
    setupWindow.loadFile(
      path.join(__dirname, '../../dist-renderer/index.html'),
      { hash: 'setup' },
    );
  }

  setupWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[SetupWindow] did-fail-load: code=${code} desc=${desc} url=${url}`);
  });

  return setupWindow;
}

export function createWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().bounds;

  Menu.setApplicationMenu(null);

  const mainWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: !app.isPackaged,
    },
    show: false,
    title: 'POSCLINIC',
    icon: iconPath,
    autoHideMenuBar: true,
  });
  // Fonts, spacing and grids follow the screen (a Full HD monoblock: about 115 %).
  attachUiScale(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow.setBounds({ x: 0, y: 0, width, height });
    mainWindow.maximize();
    mainWindow.show();
    mainWindow.focus();
  });

  if (!app.isPackaged) globalShortcut.register('CommandOrControl+Shift+I', () => {
    mainWindow.webContents.toggleDevTools();
  });

  mainWindow.on('closed', () => {
    globalShortcut.unregister('CommandOrControl+Shift+I');
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5175');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist-renderer/index.html'));
  }

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[Window] did-fail-load: code=${code} desc=${desc} url=${url}`);
  });

  // The window's X asks the renderer first ("exit?"). A deliberate app.quit() (the update
  // installer, app:quit) is let through, or quitAndInstall would never get to install.
  let appQuitting = false;
  app.once('before-quit', () => {
    appQuitting = true;
  });
  mainWindow.on('close', (e) => {
    if (appQuitting) return;
    e.preventDefault();
    mainWindow.webContents.send('app:close-requested');
  });

  const onConfirmClose = () => mainWindow.destroy();
  ipcMain.on('app:confirm-close', onConfirmClose);
  mainWindow.on('closed', () =>
    ipcMain.removeListener('app:confirm-close', onConfirmClose),
  );

  return mainWindow;
}

// ── UI scale (v2.6.1, ui-scale.ts) ───────────────────────────────────────────────────────────

const uiScaleFile = () => path.join(app.getPath('userData'), 'ui-scale.json');
let uiScaleChoice: UiScaleChoice | null = null;
const scaledWindows = new Set<BrowserWindow>();

export function getUiScaleChoice(): UiScaleChoice {
  if (uiScaleChoice === null) uiScaleChoice = readUiScale(uiScaleFile());
  return uiScaleChoice;
}

function applyUiScale(win: BrowserWindow): number {
  if (win.isDestroyed()) return 1;
  const [w, h] = win.getContentSize();
  const factor = effectiveScale(getUiScaleChoice(), w, h);
  if (Math.abs(win.webContents.getZoomFactor() - factor) > 0.001) {
    win.webContents.setZoomFactor(factor);
  }
  return factor;
}

/** Zooms the window's page to its size, now and on every resize (maximise, restore). */
export function attachUiScale(win: BrowserWindow): void {
  scaledWindows.add(win);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => applyUiScale(win), 120);
  };
  win.webContents.on('did-finish-load', () => applyUiScale(win));
  win.on('resize', later);
  win.on('closed', () => {
    clearTimeout(timer);
    scaledWindows.delete(win);
  });
}

/** The scale shown now in the first main window (for Settings → General). */
export function currentUiScale(): number {
  for (const w of scaledWindows) if (!w.isDestroyed()) return w.webContents.getZoomFactor();
  return 1;
}

/** Saves this PC's choice and applies it to every main window at once. */
export function setUiScaleChoice(choice: UiScaleChoice): number {
  writeUiScale(uiScaleFile(), choice);
  uiScaleChoice = choice;
  let factor = 1;
  for (const w of scaledWindows) factor = applyUiScale(w);
  return factor;
}
