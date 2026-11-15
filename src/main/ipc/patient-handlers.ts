import { handle, ipcSafe, RefusedError } from './ipc-safe';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';
import { randomUUID } from 'crypto';
import { normalizePhone } from '../../shared/phone';
import { isUniqueConflict, withUniqueRetry } from './appointment-handlers';

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

/** The phone is the patient's identity: one canonical `+998XXXXXXXXX`, or refused. */
function patientPhone(raw: unknown): string {
  const phone = typeof raw === 'string' ? normalizePhone(raw) : null;
  if (!phone) throw new RefusedError('errors.invalidPhone');
  return phone;
}

/** An optional text field from a form: empty clears it. */
const optional = (v: unknown): string | null | undefined =>
  v === undefined ? undefined : typeof v === 'string' && v.trim() ? v.trim() : null;

/** `YYYY-MM-DD` / ISO from a form; empty clears it, garbage is ignored. */
function birthDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function phoneTaken(error: unknown): never {
  if (isUniqueConflict(error, ['phone'])) throw new RefusedError('errors.phoneTaken');
  throw error;
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
      const q = String(query ?? '').trim();
      if (!q) return [];
      // A typed phone matches its stored canonical form too (`90 123` → `+99890123`).
      const digits = q.replace(/[\s()+-]/g, '');
      const phones = /^\d+$/.test(digits) ? [digits] : [];
      const patients = await prisma.patient.findMany({
        where: {
          active: true,
          OR: [
            { fullName: { contains: q } },
            { phone: { contains: q } },
            { patientCode: { contains: q } },
            ...phones.map((d) => ({ phone: { contains: d } })),
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
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
            include: { items: true, doctor: true },
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
      const phone = patientPhone(data?.phone);
      const prisma = getPrismaClient();
      const patient = await withUniqueRetry(['patient_code', 'patientCode'], () =>
        prisma.$transaction(async (tx: Tx) =>
          tx.patient.create({
            data: {
              id: randomUUID(),
              patientCode: await nextPatientCode(tx),
              fullName: String(data.fullName ?? '').trim(),
              phone,
              birthDate: birthDate(data.birthDate) ?? null,
              gender: optional(data.gender) ?? null,
              bloodType: optional(data.bloodType) ?? null,
              allergies: optional(data.allergies) ?? null,
              address: optional(data.address) ?? null,
              city: optional(data.city) ?? null,
              notes: optional(data.notes) ?? null,
            },
          }),
        ),
      ).catch(phoneTaken);

      return ipcSafe(patient);
    } catch (error) {
      log.error('[patients:create]', error);
      throw error;
    }
  });

  handle('patients:update', async (_event, id: string, data: Record<string, unknown>) => {
    try {
      const prisma = getPrismaClient();
      const fullName = typeof data.fullName === 'string' ? data.fullName.trim() : undefined;
      const patient = await prisma.patient
        .update({
          where: { id },
          data: {
            fullName: fullName || undefined,
            phone: data.phone === undefined ? undefined : patientPhone(data.phone),
            birthDate: birthDate(data.birthDate),
            gender: optional(data.gender),
            bloodType: optional(data.bloodType),
            allergies: optional(data.allergies),
            address: optional(data.address),
            city: optional(data.city),
            notes: optional(data.notes),
          },
        })
        .catch(phoneTaken);
      return ipcSafe(patient);
    } catch (error) {
      log.error('[patients:update]', error);
      throw error;
    }
  });
}
