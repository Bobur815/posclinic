import { BrowserWindow, screen, Menu, globalShortcut, ipcMain, app } from 'electron';
import path from 'path';

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

  mainWindow.on('close', (e) => {
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
