import { handle } from './ipc-safe';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';

export function setupPrintHandlers(): void {
  handle('print:serviceReceipt', async (_event, appointmentId: string) => {
    try {
      const prisma = getPrismaClient();
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { patient: true, doctor: true, items: true },
      });

      if (!appointment) return { success: false, error: 'Appointment not found' };

      // For now, log the receipt content (actual printer integration can be added later)
      log.info('[print] Service receipt for appointment:', appointment.appointmentNumber);
      return { success: true };
    } catch (error) {
      log.error('[print:serviceReceipt]', error);
      return { success: false, error: String(error) };
    }
  });

  handle('print:prescription', async (_event, appointmentId: string) => {
    try {
      const prisma = getPrismaClient();
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { patient: true, doctor: true },
      });

      if (!appointment) return { success: false, error: 'Appointment not found' };

      log.info('[print] Prescription for appointment:', appointment.appointmentNumber);
      return { success: true };
    } catch (error) {
      log.error('[print:prescription]', error);
      return { success: false, error: String(error) };
    }
  });
}
