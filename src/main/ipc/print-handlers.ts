import type { PrinterConfig, PrintResult, TestPrintTarget } from '../../shared/printing';
import {
  buildPrescriptionHTML,
  buildTestPageHTML,
  buildVisitReceiptHTML,
  type DocumentPaper,
  type PrintSourceAppointment,
  type ReceiptLayout,
  readReceiptLayout,
  toPrintableVisit,
} from '../../shared/receipt-html';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';
import { readPrinterConfig, writePrinterConfig } from '../printing/printer-config';
import { getReceiptLayout, setReceiptLayout } from '../printing/receipt-layout';
import { errorSummary, handle, RefusedError, requireAdmin, requireReception } from './ipc-safe';

/**
 * Printing (v2.7, after SavdoChef/posgro). Two kinds of settings:
 * - this PC's printers (`print:getConfig` / `print:setConfig`, userData/printer.json): every till,
 *   a satellite included, prints on its own printer;
 * - the clinic's receipt layout (`receipt:getLayout` / `receipt:setLayout`, main till's DB): a
 *   satellite's calls go to its main till, so all tills print the same receipt.
 * A satellite prints a visit with the visit and the layout fetched from its main till
 * (dispatch.ts `satellitePrint`), on its own printer (the functions in `PRINTERS`).
 */

/** The print engine is loaded on first use: it needs Electron, the handler tests do not. */
type Engine = typeof import('../printing/print-engine');
let engine: Engine | null = null;
async function getEngine(): Promise<Engine> {
  engine ??= await import('../printing/print-engine');
  return engine;
}

let configFile: string | null = null;

/** index.ts: where this PC's printer choice is kept (userData/printer.json). */
export function setPrinterConfigFile(file: string): void {
  configFile = file;
}

export function printerConfig(): PrinterConfig {
  if (!configFile) throw new Error('printer config file not set');
  return readPrinterConfig(configFile);
}

function failed(error: unknown): PrintResult {
  const message = error instanceof Error ? error.message : String(error);
  return { success: false, error: message || 'printing.errors.failed' };
}

/** Where a prescription goes: the A4 printer when one is chosen, else the receipt roll. */
function documentTarget(cfg: PrinterConfig): { printer: string; paper: DocumentPaper } {
  return cfg.documentPrinter
    ? { printer: cfg.documentPrinter, paper: 'A4' }
    : { printer: cfg.receiptPrinter, paper: cfg.paperWidth };
}

export async function printServiceReceipt(
  appointment: PrintSourceAppointment,
  layout: ReceiptLayout,
): Promise<PrintResult> {
  try {
    const cfg = printerConfig();
    const html = buildVisitReceiptHTML(toPrintableVisit(appointment), layout, cfg.paperWidth);
    await (await getEngine()).printHtml(html, cfg.receiptPrinter, cfg.paperWidth);
    return { success: true };
  } catch (error) {
    log.warn('[print] receipt failed:', errorSummary(error));
    return failed(error);
  }
}

export async function printPrescription(
  appointment: PrintSourceAppointment,
  layout: ReceiptLayout,
): Promise<PrintResult> {
  try {
    const visit = toPrintableVisit(appointment);
    if (!visit.diagnosis && !visit.prescription) return failed('printing.errors.noPrescription');
    const { printer, paper } = documentTarget(printerConfig());
    await (
      await getEngine()
    ).printHtml(buildPrescriptionHTML(visit, layout, paper), printer, paper);
    return { success: true };
  } catch (error) {
    log.warn('[print] prescription failed:', errorSummary(error));
    return failed(error);
  }
}

export const PRINTERS: Record<
  string,
  (a: PrintSourceAppointment, layout: ReceiptLayout) => Promise<PrintResult>
> = {
  'print:serviceReceipt': printServiceReceipt,
  'print:prescription': printPrescription,
};

/** What a printed visit needs (also what `appointments:getById` returns to a satellite). */
export const PRINTABLE_APPOINTMENT_INCLUDE = {
  patient: true,
  doctor: true,
  items: true,
  payments: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      method: true,
      amount: true,
      createdAt: true,
      createdBy: { select: { fullName: true } },
    },
  },
};

export function setupPrintHandlers(): void {
  for (const [channel, print] of Object.entries(PRINTERS)) {
    handle(channel, async (ctx, appointmentId: unknown) => {
      // A visit holds medical data: only a signed-in user prints it.
      if (!ctx.actor) throw new RefusedError('errors.notAuthenticated');
      try {
        const db = getPrismaClient();
        const appointment = await db.appointment.findUnique({
          where: { id: String(appointmentId ?? '') },
          include: PRINTABLE_APPOINTMENT_INCLUDE,
        });
        if (!appointment) return failed('errors.notFound');
        const source = JSON.parse(JSON.stringify(appointment)) as PrintSourceAppointment;
        return await print(source, await getReceiptLayout(db));
      } catch (error) {
        log.error(`[${channel}]`, errorSummary(error));
        return failed(error);
      }
    });
  }

  // ── This PC's printers (run on the machine itself, a satellite included) ──
  handle('print:listPrinters', async () => (await getEngine()).listPrinters());

  handle('print:getConfig', () => printerConfig());

  handle('print:setConfig', (ctx, patch: Record<string, unknown>) => {
    requireAdmin(ctx);
    if (!configFile) throw new Error('printer config file not set');
    try {
      return writePrinterConfig(configFile, patch ?? {});
    } catch (e) {
      if ((e as Error).message === 'errors.invalidSetting') {
        throw new RefusedError('errors.invalidSetting');
      }
      throw e;
    }
  });

  handle('print:test', async (_ctx, target: TestPrintTarget, layout?: ReceiptLayout) => {
    try {
      const cfg = printerConfig();
      const { printer, paper } =
        target === 'document'
          ? documentTarget(cfg)
          : { printer: cfg.receiptPrinter, paper: cfg.paperWidth };
      // A satellite passes its main till's layout (dispatch.ts); the main till reads its own.
      const lay = layout ? readReceiptLayout(layout) : await getReceiptLayout(getPrismaClient());
      await (await getEngine()).printHtml(buildTestPageHTML(lay, paper, printer), printer, paper);
      return { success: true } satisfies PrintResult;
    } catch (error) {
      return failed(error);
    }
  });

  /** After a cash payment: kicks the drawer when this PC has one; otherwise does nothing. */
  handle('print:openDrawer', async (ctx) => {
    requireReception(ctx);
    const cfg = printerConfig();
    if (!cfg.cashDrawer || !cfg.receiptPrinter) return { success: true } satisfies PrintResult;
    try {
      await (await getEngine()).kickCashDrawer(cfg.receiptPrinter);
      return { success: true } satisfies PrintResult;
    } catch (error) {
      return failed(error);
    }
  });

  /** Settings → Printer → "Open drawer": whether or not the option is ticked. */
  handle('print:testDrawer', async (ctx) => {
    requireAdmin(ctx);
    try {
      await (await getEngine()).kickCashDrawer(printerConfig().receiptPrinter);
      return { success: true } satisfies PrintResult;
    } catch (error) {
      return failed(error);
    }
  });

  // ── The clinic's receipt layout (main till; a satellite's calls are forwarded to it) ──
  handle('receipt:getLayout', async () => getReceiptLayout(getPrismaClient()));

  handle('receipt:setLayout', async (ctx, patch: Record<string, unknown>) => {
    requireAdmin(ctx);
    try {
      return await setReceiptLayout(getPrismaClient(), patch ?? {});
    } catch (e) {
      if ((e as Error).message === 'errors.invalidSetting') {
        throw new RefusedError('errors.invalidSetting');
      }
      throw e;
    }
  });
}
