import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';
import { handle } from './ipc-safe';

/** What the printers need of a visit (as `appointments:getById` returns it). */
interface PrintableAppointment {
  id: string;
  appointmentNumber: string;
}

type PrintResult = { success: boolean; error?: string };

/**
 * Prints on THIS machine's printer. A satellite prints on its own printer: it fetches the visit
 * from its main till (`appointments:getById`) and calls these (dispatch.ts `satellitePrint`).
 * For now the receipt content is only logged (printer integration comes later).
 */
export function printServiceReceipt(appointment: PrintableAppointment): PrintResult {
  log.info('[print] Service receipt for appointment:', appointment.appointmentNumber);
  return { success: true };
}

export function printPrescription(appointment: PrintableAppointment): PrintResult {
  log.info('[print] Prescription for appointment:', appointment.appointmentNumber);
  return { success: true };
}

export const PRINTERS: Record<string, (a: PrintableAppointment) => PrintResult> = {
  'print:serviceReceipt': printServiceReceipt,
  'print:prescription': printPrescription,
};

export function setupPrintHandlers(): void {
  for (const [channel, print] of Object.entries(PRINTERS)) {
    handle(channel, async (_ctx, appointmentId: string) => {
      try {
        const appointment = await getPrismaClient().appointment.findUnique({
          where: { id: String(appointmentId) },
          select: { id: true, appointmentNumber: true },
        });
        if (!appointment) return { success: false, error: 'Appointment not found' };
        return print(appointment);
      } catch (error) {
        log.error(`[${channel}]`, error);
        return { success: false, error: String(error) };
      }
    });
  }
}
