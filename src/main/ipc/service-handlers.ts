import { handle, ipcSafe } from './ipc-safe';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';

export function setupServiceHandlers(): void {
  handle('services:getAll', async () => {
    try {
      const prisma = getPrismaClient();
      const services = await prisma.service.findMany({
        orderBy: { name: 'asc' },
      });
      return ipcSafe(services);
    } catch (error) {
      log.error('[services:getAll]', error);
      throw error;
    }
  });

  handle('services:getActive', async () => {
    try {
      const prisma = getPrismaClient();
      const services = await prisma.service.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
      });
      return ipcSafe(services);
    } catch (error) {
      log.error('[services:getActive]', error);
      throw error;
    }
  });

  handle('services:search', async (_event, query: string) => {
    try {
      const prisma = getPrismaClient();
      const q = `%${query}%`;
      const services = await prisma.$queryRaw<unknown[]>`
        SELECT * FROM services
        WHERE (name LIKE ${q} OR code LIKE ${q})
        AND active = 1
        ORDER BY name ASC
        LIMIT 30
      `;
      return ipcSafe(services);
    } catch (error) {
      log.error('[services:search]', error);
      throw error;
    }
  });

  handle('services:create', async (_event, data: Record<string, unknown>) => {
    try {
      const prisma = getPrismaClient();
      const { randomUUID } = await import('crypto');
      const service = await prisma.service.create({
        data: {
          id: randomUUID(),
          code: data.code as string,
          name: data.name as string,
          description: (data.description as string) || null,
          price: data.price as number,
          duration: (data.duration as number) || 30,
        },
      });
      return ipcSafe(service);
    } catch (error) {
      log.error('[services:create]', error);
      throw error;
    }
  });

  handle('services:update', async (_event, id: string, data: Record<string, unknown>) => {
    try {
      const prisma = getPrismaClient();
      const service = await prisma.service.update({
        where: { id },
        data: {
          code: data.code as string | undefined,
          name: data.name as string | undefined,
          description: data.description as string | null | undefined,
          price: data.price as number | undefined,
          duration: data.duration as number | undefined,
          active: data.active as boolean | undefined,
        },
      });
      return ipcSafe(service);
    } catch (error) {
      log.error('[services:update]', error);
      throw error;
    }
  });
}
