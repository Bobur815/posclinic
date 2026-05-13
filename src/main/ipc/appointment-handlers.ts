import { ipcMain } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { getAppConfig } from '../config/app-config';
import { log } from '../logger';
import { randomUUID } from 'crypto';

function ipcSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function getNextAppointmentNumber(prisma: ReturnType<typeof getPrismaClient>): Promise<string> {
  const today = new Date();
  const prefix = `A${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const last = await prisma.appointment.findFirst({
    where: { appointmentNumber: { startsWith: prefix } },
    orderBy: { createdAt: 'desc' },
    select: { appointmentNumber: true },
  });

  if (!last) return `${prefix}-001`;
  const seq = parseInt(last.appointmentNumber.split('-')[1] || '0', 10);
  return `${prefix}-${String(seq + 1).padStart(3, '0')}`;
}

export function setupAppointmentHandlers(): void {
  ipcMain.handle('appointments:create', async (_event, data: Record<string, unknown>) => {
    try {
      const prisma = getPrismaClient();
      const config = getAppConfig();
      const appointmentNumber = await getNextAppointmentNumber(prisma);

      const items = (data.items as Array<{
        serviceId: string;
        serviceName: string;
        quantity: number;
        unitPrice: number;
        total: number;
      }>) || [];

      const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

      const appointment = await prisma.appointment.create({
        data: {
          id: randomUUID(),
          appointmentNumber,
          patientId: data.patientId as string,
          doctorId: data.doctorId as string,
          appointmentDate: new Date(data.appointmentDate as string),
          notes: (data.notes as string) || null,
          totalAmount,
          terminalId: config.terminalId,
          items: {
            create: items.map((item) => ({
              id: randomUUID(),
              serviceId: item.serviceId,
              serviceName: item.serviceName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
            })),
          },
        },
        include: { items: true, patient: true, doctor: true },
      });

      return ipcSafe(appointment);
    } catch (error) {
      log.error('[appointments:create]', error);
      throw error;
    }
  });

  ipcMain.handle('appointments:getAll', async (_event, filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    today?: boolean;
  }) => {
    try {
      const prisma = getPrismaClient();
      const where: Record<string, unknown> = {};

      if (filters?.status) where.status = filters.status;
      if (filters?.today) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        where.appointmentDate = { gte: start, lte: end };
      } else if (filters?.startDate || filters?.endDate) {
        where.appointmentDate = {};
        if (filters.startDate) (where.appointmentDate as Record<string, unknown>).gte = new Date(filters.startDate);
        if (filters.endDate) (where.appointmentDate as Record<string, unknown>).lte = new Date(filters.endDate);
      }

      const appointments = await prisma.appointment.findMany({
        where,
        include: { patient: true, doctor: true, items: true },
        orderBy: { appointmentDate: 'desc' },
      });

      return ipcSafe(appointments);
    } catch (error) {
      log.error('[appointments:getAll]', error);
      throw error;
    }
  });

  ipcMain.handle('appointments:getById', async (_event, id: string) => {
    try {
      const prisma = getPrismaClient();
      const appointment = await prisma.appointment.findUnique({
        where: { id },
        include: { patient: true, doctor: true, items: { include: { service: true } } },
      });
      return ipcSafe(appointment);
    } catch (error) {
      log.error('[appointments:getById]', error);
      throw error;
    }
  });

  ipcMain.handle('appointments:update', async (_event, id: string, data: Record<string, unknown>) => {
    try {
      const prisma = getPrismaClient();
      const appointment = await prisma.appointment.update({
        where: { id },
        data: {
          status: data.status as string | undefined,
          diagnosis: data.diagnosis as string | null | undefined,
          prescription: data.prescription as string | null | undefined,
          notes: data.notes as string | null | undefined,
          paymentStatus: data.paymentStatus as string | undefined,
          paymentMethod: data.paymentMethod as string | null | undefined,
          paidAmount: data.paidAmount as number | undefined,
        },
        include: { patient: true, doctor: true, items: true },
      });
      return ipcSafe(appointment);
    } catch (error) {
      log.error('[appointments:update]', error);
      throw error;
    }
  });

  ipcMain.handle('appointments:getTodaySummary', async () => {
    try {
      const prisma = getPrismaClient();
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const [total, completed, paid, appointments] = await Promise.all([
        prisma.appointment.count({
          where: { appointmentDate: { gte: start, lte: end } },
        }),
        prisma.appointment.count({
          where: { appointmentDate: { gte: start, lte: end }, status: 'COMPLETED' },
        }),
        prisma.appointment.findMany({
          where: { appointmentDate: { gte: start, lte: end }, paymentStatus: 'PAID' },
          select: { paidAmount: true },
        }),
        prisma.appointment.findMany({
          where: { appointmentDate: { gte: start, lte: end } },
          include: { patient: true, doctor: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

      const revenue = paid.reduce((sum, a) => sum + Number(a.paidAmount), 0);

      return ipcSafe({
        total,
        completed,
        revenue,
        pending: total - completed,
        recentAppointments: appointments,
      });
    } catch (error) {
      log.error('[appointments:getTodaySummary]', error);
      throw error;
    }
  });

  ipcMain.handle('appointments:checkout', async (_event, id: string, data: {
    paymentMethod: string;
    paidAmount: number;
  }) => {
    try {
      const prisma = getPrismaClient();
      const appointment = await prisma.appointment.findUnique({
        where: { id },
        select: { totalAmount: true },
      });

      if (!appointment) throw new Error('Appointment not found');

      const totalAmount = Number(appointment.totalAmount);
      const paidAmount = Number(data.paidAmount);
      const paymentStatus = paidAmount >= totalAmount ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING';

      const updated = await prisma.appointment.update({
        where: { id },
        data: {
          status: paymentStatus === 'PAID' ? 'COMPLETED' : undefined,
          paymentStatus,
          paymentMethod: data.paymentMethod,
          paidAmount: data.paidAmount,
        },
        include: { patient: true, doctor: true, items: true },
      });

      return ipcSafe(updated);
    } catch (error) {
      log.error('[appointments:checkout]', error);
      throw error;
    }
  });
}
