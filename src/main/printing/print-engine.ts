import { spawn } from 'node:child_process';
import path from 'node:path';
import { BrowserWindow, webContents } from 'electron';
import type { DocumentPaper } from '../../shared/receipt-html';
import { log } from '../logger';
import { PrintQueue } from './print-queue';

/**
 * Electron printing (port of SavdoChef printer/thermal-printer.ts): an HTML document is loaded
 * in a hidden, script-less window and sent silently to a named Windows/CUPS printer. Every job
 * goes through one queue (print-queue.ts). The cash drawer is an ESC/POS kick sent raw to the
 * receipt printer through winspool (Windows only).
 */

const queue = new PrintQueue();

/** Printer names this machine knows (Windows "Devices and Printers" / CUPS). */
export async function listPrinters(): Promise<string[]> {
  const wc = webContents.getAllWebContents().find((w) => !w.isDestroyed());
  if (wc) return (await wc.getPrintersAsync()).map((p) => p.name);
  // No window yet: a throwaway one asks the OS.
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, javascript: false },
  });
  try {
    return (await win.webContents.getPrintersAsync()).map((p) => p.name);
  } finally {
    win.destroy();
  }
}

/** Throws an i18n key when the printer is not chosen or no longer installed. */
async function assertPrinter(deviceName: string): Promise<void> {
  if (!deviceName) throw new Error('printing.errors.noPrinter');
  const known = await listPrinters();
  if (!known.includes(deviceName)) throw new Error('printing.errors.printerMissing');
}

/** Prints `html` on `deviceName`; resolves when the spooler took the job. */
export function printHtml(html: string, deviceName: string, paper: DocumentPaper): Promise<void> {
  return queue.run(async () => {
    await assertPrinter(deviceName);
    await printNow(html, deviceName, paper);
  });
}

async function printNow(html: string, deviceName: string, paper: DocumentPaper): Promise<void> {
  const roll = paper !== 'A4';
  const widthMm = paper === '58' ? 58 : 80;
  // Roll: rendered at 4x (≈384 dpi) so the 203 dpi head downsamples, which prints sharper text
  // than upscaling; the window is widened to match so the mm layout is unchanged (SavdoChef).
  const scale = roll ? 4 : 1;
  const win = new BrowserWindow({
    show: false,
    width: roll ? (Math.round(widthMm * 3.78) + 20) * scale : 820,
    height: roll ? 2400 : 1160,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    if (scale !== 1) win.webContents.setZoomFactor(scale);
    await new Promise((r) => setTimeout(r, 200)); // let images decode and layout settle

    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName,
          // Roll: no pageSize. Thermal GDI drivers queue a job with a custom size and then
          // ignore it; the roll width is set once in the driver's preferences (SavdoChef).
          ...(roll ? { margins: { marginType: 'none' as const } } : { pageSize: 'A4' as const }),
        },
        (success, failureReason) => {
          if (success) resolve();
          else reject(new Error(failureReason || 'printing.errors.failed'));
        },
      );
    });
  } finally {
    win.destroy();
  }
}

/**
 * ESC p 0 25 250: pulse drawer pin 2 (50 ms on, 500 ms off), written RAW to the printer queue
 * through winspool, bypassing the GDI driver. The printer name goes in through the environment,
 * never into the script text.
 */
const DRAWER_SCRIPT = `
Add-Type -TypeDefinition @"
using System;using System.Runtime.InteropServices;
public class PosclinicRawPrint{
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
  public struct DOCINFO{[MarshalAs(UnmanagedType.LPWStr)]public string pDocName;[MarshalAs(UnmanagedType.LPWStr)]public string pOutputFile;[MarshalAs(UnmanagedType.LPWStr)]public string pDataType;}
  [DllImport("winspool.drv",CharSet=CharSet.Unicode,SetLastError=true)]public static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d);
  [DllImport("winspool.drv",SetLastError=true)]public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv",CharSet=CharSet.Unicode,SetLastError=true)]public static extern int StartDocPrinter(IntPtr h,int l,ref DOCINFO d);
  [DllImport("winspool.drv",SetLastError=true)]public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)]public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)]public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv",SetLastError=true)]public static extern bool WritePrinter(IntPtr h,IntPtr b,int c,out int w);
  public static bool Send(string name,byte[] data){
    IntPtr h;if(!OpenPrinter(name,out h,IntPtr.Zero))return false;
    var d=new DOCINFO{pDocName="Drawer",pOutputFile=null,pDataType="RAW"};
    if(StartDocPrinter(h,1,ref d)<=0){ClosePrinter(h);return false;}
    StartPagePrinter(h);
    IntPtr b=Marshal.AllocCoTaskMem(data.Length);Marshal.Copy(data,0,b,data.Length);int w;
    WritePrinter(h,b,data.Length,out w);Marshal.FreeCoTaskMem(b);
    EndPagePrinter(h);EndDocPrinter(h);ClosePrinter(h);return w==data.Length;}
}
"@
$ok = [PosclinicRawPrint]::Send($env:POSCLINIC_PRINTER, [byte[]](0x1B,0x70,0x00,0x19,0xFA))
if (-not $ok) { exit 1 }
`;

/** By full path: a bare name is looked up in the current directory first on Windows. */
const POWERSHELL = path.join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);

export async function kickCashDrawer(printerName: string): Promise<void> {
  if (process.platform !== 'win32') throw new Error('printing.errors.drawerWindowsOnly');
  await assertPrinter(printerName);
  await new Promise<void>((resolve, reject) => {
    const ps = spawn(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', DRAWER_SCRIPT], {
      env: { ...process.env, POSCLINIC_PRINTER: printerName },
      windowsHide: true,
    });
    const timer = setTimeout(() => ps.kill(), 20_000);
    ps.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else {
        log.warn(`[print] cash drawer kick failed (exit ${code})`);
        reject(new Error('printing.errors.drawerFailed'));
      }
    });
    ps.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}
