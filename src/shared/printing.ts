import type { PaperWidth } from './receipt-html';

/**
 * This PC's printers (Settings → Printer). Per machine, never in the clinic database: a satellite
 * till has its own printer. Kept in `userData/printer.json` (src/main/printing/printer-config.ts).
 */
export interface PrinterConfig {
  /** The thermal receipt printer (Windows printer name); '' = none chosen, nothing is printed. */
  receiptPrinter: string;
  /** Roll width of the receipt printer. */
  paperWidth: PaperWidth;
  /** A4 printer for prescriptions; '' = prescriptions go on the receipt printer. */
  documentPrinter: string;
  /** Kick the cash drawer (wired to the receipt printer) after a cash payment. Windows only. */
  cashDrawer: boolean;
}

export const PRINTER_CONFIG_DEFAULTS: PrinterConfig = {
  receiptPrinter: '',
  paperWidth: '80',
  documentPrinter: '',
  cashDrawer: false,
};

/** Printer names come from the OS; this only keeps them sane. */
const NAME_MAX = 256;

/** `base` with the valid fields of `patch`, or the first invalid field's name. */
export function applyPrinterConfig(
  base: PrinterConfig,
  patch: Record<string, unknown>,
): PrinterConfig | { invalid: string } {
  const out: PrinterConfig = { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (v === undefined) continue;
    if (k === 'receiptPrinter' || k === 'documentPrinter') {
      // Control characters never appear in a printer name (and would reach the drawer script).
      if (typeof v !== 'string' || v.length > NAME_MAX || /[\u0000-\u001f]/.test(v)) {
        return { invalid: k };
      }
      out[k] = v;
    } else if (k === 'paperWidth') {
      if (v !== '80' && v !== '58') return { invalid: k };
      out.paperWidth = v;
    } else if (k === 'cashDrawer') {
      if (typeof v !== 'boolean') return { invalid: k };
      out.cashDrawer = v;
    }
  }
  return out;
}

/** What a print call answers. `error` is an i18n key (`printing.errors.*`) or a driver message. */
export type PrintResult = { success: true } | { success: false; error: string };

export type TestPrintTarget = 'receipt' | 'document';
