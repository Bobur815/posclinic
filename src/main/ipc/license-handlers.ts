import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { normalizePhone } from '../../shared/phone';
import { seedParasitologyServices } from '../database/seed-parasitology';
import {
  getPrismaClient,
  readClinicBootstrap,
  reinitializeDatabaseForClinic,
  writeClinicBootstrap,
} from '../database/sqlite-client';
import { getLicenseService, licenseApiUrl } from '../license/license-service';
import { log } from '../logger';
import { errorSummary, handle } from './ipc-safe';

/** The renderer is told to re-read `license:status` whenever this fires (`license:changed`). */
export function setupLicenseHandlers(): void {
  const license = getLicenseService();

  // The gate's view of the clinic DB; read lazily so it follows the DB switch at setup.
  license.setFacts({
    activeDoctors: async (excludeId) =>
      getPrismaClient().doctor.count({
        where: { active: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
      }),
    activeUsers: async (excludeId) =>
      getPrismaClient().user.count({
        where: { active: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
      }),
    visitsThisMonth: async () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      // A visit for the plan limit is one patient journey (a case), however many paid orders
      // it has (owner decision 2026-11-15).
      return getPrismaClient().clinicalCase.count({ where: { createdAt: { gte: start } } });
    },
    appointmentBalance: async (id) => {
      const a = await getPrismaClient().appointment.findUnique({
        where: { id },
        select: { totalAmount: true, paidAmount: true },
      });
      return a ? { total: Number(a.totalAmount), paid: Number(a.paidAmount) } : null;
    },
  });

  handle('license:status', () => license.status());
  handle('license:checkNow', () => license.renew());

  /**
   * Setup step 1: link to the clinic the posgro super admin created (owner phone + one-time
   * activation code), then open that clinic's own DB file. Allowed only before setup finished:
   * re-linking a working till to another clinic is a super-admin job.
   */
  handle('license:activate', async (_ctx, phone: unknown, code: unknown) => {
    if (typeof phone !== 'string' || typeof code !== 'string') {
      return { ok: false, error: 'license.errors.invalid_code' };
    }
    if (await setupFinished()) {
      // A working till whose licence file was lost or corrupted: re-link, same clinic only.
      const clinicId = readClinicBootstrap();
      if (license.isLinked() || !clinicId) {
        return { ok: false, error: 'license.errors.already_setup' };
      }
      const result = await license.activate(phone, code, clinicId);
      return result.ok ? { ...result, recovered: true } : result;
    }
    const result = await license.activate(phone, code);
    if (!result.ok) return result;

    writeClinicBootstrap(result.storeId);
    await reinitializeDatabaseForClinic(result.storeId);
    const config = {
      clinicId: result.storeId,
      clinicName: result.storeName,
      terminalId: license.status().terminalId,
      apiUrl: licenseApiUrl(),
    };
    await getPrismaClient().localConfig.upsert({
      where: { id: 'config' },
      update: config,
      create: { id: 'config', ...config },
    });
    return result;
  });

  /** Setup step 2: the clinic's first admin, then the parasitology starter services. */
  const adminInput = z.object({
    fullName: z.string().trim().min(2).max(100),
    phone: z.string().transform((p, ctx) => {
      const n = normalizePhone(p);
      if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'invalid_phone' });
      return n ?? '';
    }),
    email: z
      .string()
      .trim()
      .max(200)
      .email()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    password: z.string().min(6).max(128),
    lang: z.enum(['uz', 'ru']).default('uz'),
  });

  handle('setup:createAdmin', async (_ctx, raw: unknown) => {
    try {
      if (!license.isLinked()) return { success: false, error: 'license.refused.setup' };
      if (await setupFinished()) return { success: false, error: 'license.errors.already_setup' };
      const parsed = adminInput.safeParse(raw);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return { success: false, error: `setup.errors.${issue?.path[0] ?? 'invalid'}` };
      }
      const input = parsed.data;
      const prisma = getPrismaClient();
      await prisma.user.create({
        data: {
          id: randomUUID(),
          phone: input.phone,
          email: input.email ?? null,
          password: await bcrypt.hash(input.password, 10),
          role: 'CLINIC_ADMIN',
          fullName: input.fullName,
          clinicId: license.linkedStoreId(),
        },
      });
      await seedParasitologyServices(prisma, input.lang);
      log.info('[setup] first admin created, parasitology services seeded');
      return { success: true };
    } catch (error) {
      log.error('[setup:createAdmin]', errorSummary(error));
      return { success: false, error: 'setup.errors.failed' };
    }
  });
}

/** Setup is finished once the clinic has its first user. */
async function setupFinished(): Promise<boolean> {
  try {
    return (await getPrismaClient().user.count()) > 0;
  } catch {
    return false;
  }
}
