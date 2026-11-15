import { handle, ipcSafe, requireAdmin } from './ipc-safe';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';

export function setupDoctorHandlers(): void {
  handle('doctors:getAll', async () => {
    try {
      const prisma = getPrismaClient();
      const doctors = await prisma.doctor.findMany({
        orderBy: { fullName: 'asc' },
        include: { user: { select: { phone: true, active: true } } },
      });
      return ipcSafe(doctors);
    } catch (error) {
      log.error('[doctors:getAll]', error);
      throw error;
    }
  });

  handle('doctors:getActive', async () => {
    try {
      const prisma = getPrismaClient();
      const doctors = await prisma.doctor.findMany({
        where: { active: true },
        orderBy: { fullName: 'asc' },
      });
      return ipcSafe(doctors);
    } catch (error) {
      log.error('[doctors:getActive]', error);
      throw error;
    }
  });

  handle('doctors:create', async (ctx, data: Record<string, unknown>) => {
    try {
      requireAdmin(ctx);
      const prisma = getPrismaClient();
      const { randomUUID } = await import('crypto');
      const doctor = await prisma.doctor.create({
        data: {
          id: randomUUID(),
          fullName: data.fullName as string,
          phone: (data.phone as string) || null,
          specialty: (data.specialty as string) || null,
          licenseNo: (data.licenseNo as string) || null,
        },
      });
      return ipcSafe(doctor);
    } catch (error) {
      log.error('[doctors:create]', error);
      throw error;
    }
  });

  handle('doctors:update', async (ctx, id: string, data: Record<string, unknown>) => {
    try {
      requireAdmin(ctx);
      const prisma = getPrismaClient();
      const doctor = await prisma.doctor.update({
        where: { id },
        data: {
          fullName: data.fullName as string | undefined,
          phone: data.phone as string | null | undefined,
          specialty: data.specialty as string | null | undefined,
          licenseNo: data.licenseNo as string | null | undefined,
          active: data.active as boolean | undefined,
        },
      });
      return ipcSafe(doctor);
    } catch (error) {
      log.error('[doctors:update]', error);
      throw error;
    }
  });
}
