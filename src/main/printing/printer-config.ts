import fs from 'node:fs';
import path from 'node:path';
import {
  applyPrinterConfig,
  PRINTER_CONFIG_DEFAULTS,
  type PrinterConfig,
} from '../../shared/printing';

/**
 * This PC's printer choice, in `userData/printer.json` (as ui-scale.json): a satellite is another
 * machine with its own printer, so it never goes in the clinic database. Electron-free (tests).
 */

/** The saved config; every missing or bad field falls back to its default. */
export function readPrinterConfig(file: string): PrinterConfig {
  let stored: unknown;
  try {
    stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ...PRINTER_CONFIG_DEFAULTS };
  }
  const out = { ...PRINTER_CONFIG_DEFAULTS };
  if (!stored || typeof stored !== 'object') return out;
  for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
    const one = applyPrinterConfig(out, { [k]: v });
    if (!('invalid' in one)) Object.assign(out, one);
  }
  return out;
}

/** Applies `patch` and saves; throws `errors.invalidSetting` on any invalid field. */
export function writePrinterConfig(file: string, patch: Record<string, unknown>): PrinterConfig {
  const next = applyPrinterConfig(readPrinterConfig(file), patch ?? {});
  if ('invalid' in next) throw new Error('errors.invalidSetting');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}
