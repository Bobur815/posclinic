import { handle, ipcSafe } from './ipc-safe';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';
import { randomUUID } from 'crypto';
import { withUniqueRetry } from './appointment-handlers';

type Tx = Parameters<Parameters<ReturnType<typeof getPrismaClient>['$transaction']>[0]>[0];

/** `P-0042`: the next code after the highest one used (two desks: see withUniqueRetry). */
async function nextPatientCode(db: Pick<Tx, 'patient'>): Promise<string> {
  const rows = await db.patient.findMany({
    where: { patientCode: { startsWith: 'P-' } },
    select: { patientCode: true },
  });
  const max = rows.reduce((m: number, r: { patientCode: string }) => {
    const n = parseInt(r.patientCode.slice(2), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `P-${String(max + 1).padStart(4, '0')}`;
}

export function setupPatientHandlers(): void {
  handle('patients:getAll', async (_event, filters?: { active?: boolean }) => {
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

  handle('patients:search', async (_event, query: string) => {
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

  handle('patients:getById', async (_event, id: string) => {
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

  handle('patients:create', async (_event, data: Record<string, unknown>) => {
    try {
      const prisma = getPrismaClient();
      const patient = await withUniqueRetry(['patient_code', 'patientCode'], () =>
        prisma.$transaction(async (tx: Tx) =>
          tx.patient.create({
            data: {
              id: randomUUID(),
              patientCode: await nextPatientCode(tx),
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
          }),
        ),
      );

      return ipcSafe(patient);
    } catch (error) {
      log.error('[patients:create]', error);
      throw error;
    }
  });

  handle('patients:update', async (_event, id: string, data: Record<string, unknown>) => {
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
