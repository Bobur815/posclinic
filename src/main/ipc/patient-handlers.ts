import { resolveAddress } from './address-handlers';
import { handle, ipcSafe, RefusedError, requireReception, errorSummary } from './ipc-safe';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';
import { randomUUID } from 'crypto';
import { normalizePhone } from '../../shared/phone';
import type { PatientSearch } from '../../shared/clinic';
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
      log.error('[patients:getAll]', errorSummary(error));
      throw error;
    }
  });

  /**
   * Name / phone / patient code, optionally narrowed by region, district and a visit date range
   * (`PatientSearch` in shared/clinic.ts). A plain string is the old call: text only.
   */
  handle('patients:search', async (_event, query: string | PatientSearch) => {
    try {
      const prisma = getPrismaClient();
      const f: PatientSearch =
        typeof query === 'object' && query ? query : { q: String(query ?? '') };
      const q = String(f.q ?? '').trim();
      const day = (v: unknown, end: boolean) => {
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
        return new Date(`${v}T${end ? '23:59:59.999' : '00:00:00'}`);
      };
      const from = day(f.visitedFrom, false);
      const to = day(f.visitedTo, true);
      const filters: Record<string, unknown>[] = [];
      if (typeof f.regionCode === 'string' && f.regionCode)
        filters.push({ regionCode: f.regionCode });
      if (typeof f.districtCode === 'string' && f.districtCode) {
        filters.push({ districtCode: f.districtCode });
      }
      if (from || to) {
        filters.push({
          appointments: {
            some: {
              appointmentDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
            },
          },
        });
      }
      if (!q && filters.length === 0) return [];
      // A typed phone matches its stored canonical form too (`90 123` → `+99890123`).
      const digits = q.replace(/[\s()+-]/g, '');
      const phones = /^\d+$/.test(digits) ? [digits] : [];
      const patients = await prisma.patient.findMany({
        where: {
          active: true,
          ...(filters.length ? { AND: filters } : {}),
          ...(q
            ? {
                OR: [
                  { fullName: { contains: q } },
                  { phone: { contains: q } },
                  { patientCode: { contains: q } },
                  ...phones.map((d) => ({ phone: { contains: d } })),
                ],
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return ipcSafe(patients);
    } catch (error) {
      log.error('[patients:search]', errorSummary(error));
      throw error;
    }
  });

  /**
   * Registration step 1 before anything is typed: the patients of the latest visits, newest
   * first, once each, with when they last came and for what.
   */
  handle('patients:recent', async (_ctx, limit?: unknown) => {
    try {
      const take = Math.min(Math.max(Number(limit) || 12, 1), 50);
      const visits = await getPrismaClient().appointment.findMany({
        where: { patient: { active: true } },
        orderBy: { createdAt: 'desc' },
        take: take * 6,
        select: {
          createdAt: true,
          status: true,
          patient: true,
          items: { select: { serviceName: true }, take: 3 },
        },
      });
      const seen = new Set<string>();
      const out = [];
      for (const v of visits) {
        if (seen.has(v.patient.id)) continue;
        seen.add(v.patient.id);
        out.push({
          ...v.patient,
          lastVisitAt: v.createdAt,
          lastServices: v.items.map((i) => i.serviceName),
        });
        if (out.length >= take) break;
      }
      return ipcSafe(out);
    } catch (error) {
      log.error('[patients:recent]', errorSummary(error));
      throw error;
    }
  });

  handle('patients:getById', async (_event, id: string) => {
    try {
      const prisma = getPrismaClient();
      const patient = await prisma.patient.findUnique({
        where: { id: String(id ?? '') },
        include: {
          appointments: {
            include: { items: true, doctor: true },
            orderBy: { appointmentDate: 'desc' },
            take: 20,
          },
          // The latest measurement is the patient's current height / weight (v2.5).
          vitals: { orderBy: { recordedAt: 'desc' }, take: 1 },
          cases: {
            orderBy: { openedAt: 'desc' },
            take: 20,
            select: { id: true, caseNumber: true, status: true, openedAt: true, diagnosis: true },
          },
        },
      });
      return ipcSafe(patient);
    } catch (error) {
      log.error('[patients:getById]', errorSummary(error));
      throw error;
    }
  });

  handle('patients:create', async (ctx, data: Record<string, unknown>) => {
    try {
      // Identity is registered at reception (owner decision 2026-11-15).
      requireReception(ctx);
      const phone = patientPhone(data?.phone);
      const prisma = getPrismaClient();
      const addr = await resolveAddress(prisma, data?.regionCode, data?.districtCode);
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
              chronicConditions: optional(data.chronicConditions) ?? null,
              address: optional(data.address) ?? null,
              regionCode: addr?.regionCode ?? null,
              districtCode: addr?.districtCode ?? null,
              city: addr ? addr.city : (optional(data.city) ?? null),
              notes: optional(data.notes) ?? null,
            },
          }),
        ),
      ).catch(phoneTaken);

      return ipcSafe(patient);
    } catch (error) {
      log.error('[patients:create]', errorSummary(error));
      throw error;
    }
  });

  handle('patients:update', async (ctx, id: string, data: Record<string, unknown>) => {
    try {
      const prisma = getPrismaClient();
      // A doctor or nurse edits the medical fields only; name, phone and address stay with
      // reception (owner decision 2026-11-15). Other fields they send are ignored.
      if (ctx.actor?.role === 'DOCTOR' || ctx.actor?.role === 'NURSE') {
        const patient = await prisma.patient.update({
          where: { id },
          data: {
            bloodType: optional(data?.bloodType),
            allergies: optional(data?.allergies),
            chronicConditions: optional(data?.chronicConditions),
          },
        });
        return ipcSafe(patient);
      }
      requireReception(ctx);
      const fullName = typeof data.fullName === 'string' ? data.fullName.trim() : undefined;
      const addr = await resolveAddress(prisma, data.regionCode, data.districtCode);
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
            chronicConditions: optional(data.chronicConditions),
            address: optional(data.address),
            ...(addr
              ? { regionCode: addr.regionCode, districtCode: addr.districtCode, city: addr.city }
              : { city: optional(data.city) }),
            notes: optional(data.notes),
          },
        })
        .catch(phoneTaken);
      return ipcSafe(patient);
    } catch (error) {
      log.error('[patients:update]', errorSummary(error));
      throw error;
    }
  });
}
