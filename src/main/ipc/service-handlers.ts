import { handle, ipcSafe, RefusedError, requireAdmin } from './ipc-safe';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';
import { isUniqueConflict } from './appointment-handlers';

function codeTaken(error: unknown): never {
  if (isUniqueConflict(error, ['code'])) throw new RefusedError('errors.codeTaken');
  throw error;
}

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
      const q = String(query ?? '').trim();
      if (!q) return [];
      const services = await prisma.service.findMany({
        where: { active: true, OR: [{ name: { contains: q } }, { code: { contains: q } }] },
        orderBy: { name: 'asc' },
        take: 30,
      });
      return ipcSafe(services);
    } catch (error) {
      log.error('[services:search]', error);
      throw error;
    }
  });

  handle('services:create', async (ctx, data: Record<string, unknown>) => {
    try {
      requireAdmin(ctx);
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
          active: data.active !== false,
        },
      }).catch(codeTaken);
      return ipcSafe(service);
    } catch (error) {
      log.error('[services:create]', error);
      throw error;
    }
  });

  handle('services:update', async (ctx, id: string, data: Record<string, unknown>) => {
    try {
      requireAdmin(ctx);
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
      }).catch(codeTaken);
      return ipcSafe(service);
    } catch (error) {
      log.error('[services:update]', error);
      throw error;
    }
  });
}
