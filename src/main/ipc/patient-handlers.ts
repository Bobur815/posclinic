import { ipcMain } from 'electron';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';
import { randomUUID } from 'crypto';

function ipcSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

async function getNextPatientCode(prisma: ReturnType<typeof getPrismaClient>): Promise<string> {
  const last = await prisma.patient.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { patientCode: true },
  });

  if (!last) return 'P-0001';

  const num = parseInt(last.patientCode.replace('P-', ''), 10);
  return `P-${String(num + 1).padStart(4, '0')}`;
}

export function setupPatientHandlers(): void {
  ipcMain.handle('patients:getAll', async (_event, filters?: { active?: boolean }) => {
    try {
      const prisma = getPrismaClient();
      const where: Record<string, unknown> = {};
      if (filters?.active !== undefined) where.active = filters.active;

      const patients = await prisma.patient.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return ipcSafe(patients);
    } catch (error) {
      log.error('[patients:getAll]', error);
      throw error;
    }
  });

  ipcMain.handle('patients:search', async (_event, query: string) => {
    try {
      const prisma = getPrismaClient();
      const q = `%${query}%`;
      const patients = await prisma.$queryRaw<unknown[]>`
        SELECT * FROM patients
        WHERE (full_name LIKE ${q} OR phone LIKE ${q} OR patient_code LIKE ${q})
        AND active = 1
        ORDER BY created_at DESC
        LIMIT 50
      `;
      return ipcSafe(patients);
    } catch (error) {
      log.error('[patients:search]', error);
      throw error;
    }
  });

  ipcMain.handle('patients:getById', async (_event, id: string) => {
    try {
      const prisma = getPrismaClient();
      const patient = await prisma.patient.findUnique({
        where: { id },
        include: {
          appointments: {
            include: { items: true },
            orderBy: { appointmentDate: 'desc' },
            take: 20,
          },
        },
      });
      return ipcSafe(patient);
    } catch (error) {
      log.error('[patients:getById]', error);
      throw error;
    }
  });

  ipcMain.handle('patients:create', async (_event, data: Record<string, unknown>) => {
    try {
      const prisma = getPrismaClient();
      const patientCode = await getNextPatientCode(prisma);

      const patient = await prisma.patient.create({
        data: {
          id: randomUUID(),
          patientCode,
          fullName: data.fullName as string,
          phone: data.phone as string,
          birthDate: data.birthDate ? new Date(data.birthDate as string) : null,
          gender: (data.gender as string) || null,
          bloodType: (data.bloodType as string) || null,
          allergies: (data.allergies as string) || null,
          address: (data.address as string) || null,
          city: (data.city as string) || null,
          notes: (data.notes as string) || null,
        },
      });

      return ipcSafe(patient);
    } catch (error) {
      log.error('[patients:create]', error);
      throw error;
    }
  });

  ipcMain.handle('patients:update', async (_event, id: string, data: Record<string, unknown>) => {
    try {
      const prisma = getPrismaClient();
      const patient = await prisma.patient.update({
        where: { id },
        data: {
          fullName: data.fullName as string | undefined,
          phone: data.phone as string | undefined,
          birthDate: data.birthDate ? new Date(data.birthDate as string) : undefined,
          gender: data.gender as string | null | undefined,
          bloodType: data.bloodType as string | null | undefined,
          allergies: data.allergies as string | null | undefined,
          address: data.address as string | null | undefined,
          city: data.city as string | null | undefined,
          notes: data.notes as string | null | undefined,
        },
      });
      return ipcSafe(patient);
    } catch (error) {
      log.error('[patients:update]', error);
      throw error;
    }
  });
}
