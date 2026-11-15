import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { normalizePhone } from '../../shared/phone';
import { getPrismaClient } from '../database/sqlite-client';
import { isUniqueConflict } from './appointment-handlers';
import { handle, ipcSafe, RefusedError, requireAdmin } from './ipc-safe';

/**
 * Staff logins on the till (v2.5): receptionists, nurses / lab and admins. A doctor's login is
 * made on the Doctors page (it is linked to the doctor record). Admins only; the plan's staff
 * limit is checked by the licence gate (new logins and re-activations). Synced up as users.
 */

const ROLES = ['RECEPTIONIST', 'NURSE', 'CLINIC_ADMIN'] as const;
const SAFE = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

function password(v: unknown): string {
  const p = typeof v === 'string' ? v : '';
  if (p.length < 6) throw new RefusedError('errors.passwordTooShort');
  // bcrypt reads 72 bytes; a longer password would be silently cut.
  if (p.length > 72) throw new RefusedError('errors.passwordTooLong');
  return p;
}

function phoneTaken(e: unknown): never {
  if (isUniqueConflict(e, ['phone'])) throw new RefusedError('errors.phoneTaken');
  throw e;
}

export function setupStaffHandlers(): void {
  /** Everyone with a till login, doctors included (shown read-only), never the hash. */
  handle('users:list', async (ctx) => {
    requireAdmin(ctx);
    const users = await getPrismaClient().user.findMany({
      orderBy: [{ active: 'desc' }, { fullName: 'asc' }],
      select: { ...SAFE, doctor: { select: { id: true } } },
    });
    return ipcSafe(users);
  });

  handle('users:create', async (ctx, data: Record<string, unknown>) => {
    requireAdmin(ctx);
    const role = String(data?.role ?? '');
    if (role === 'DOCTOR') throw new RefusedError('errors.useDoctorsPage');
    if (!(ROLES as readonly string[]).includes(role)) throw new RefusedError('errors.invalidRole');
    const fullName = typeof data?.fullName === 'string' ? data.fullName.trim().slice(0, 200) : '';
    if (!fullName) throw new RefusedError('errors.nameRequired');
    const phone = normalizePhone(typeof data?.phone === 'string' ? data.phone : null);
    if (!phone) throw new RefusedError('errors.invalidPhone');
    const hash = await bcrypt.hash(password(data?.password), 10);
    const user = await getPrismaClient()
      .user.create({
        data: { id: randomUUID(), fullName, phone, role, password: hash },
        select: SAFE,
      })
      .catch(phoneTaken);
    return ipcSafe(user);
  });

  /** Name, role, active. An admin never demotes or deactivates themself; doctors keep DOCTOR. */
  handle('users:update', async (ctx, id: unknown, data: Record<string, unknown>) => {
    requireAdmin(ctx);
    const db = getPrismaClient();
    const userId = String(id ?? '');
    const current = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, doctor: { select: { id: true } } },
    });
    if (!current) throw new RefusedError('errors.notFound');
    const self = ctx.actor?.id === userId;
    const role = data?.role === undefined ? undefined : String(data.role);
    if (role !== undefined && role !== current.role) {
      if (self) throw new RefusedError('errors.selfDemote');
      if (current.doctor || current.role === 'DOCTOR' || role === 'DOCTOR') {
        throw new RefusedError('errors.useDoctorsPage');
      }
      if (!(ROLES as readonly string[]).includes(role))
        throw new RefusedError('errors.invalidRole');
    }
    if (data?.active === false && self) throw new RefusedError('errors.selfDemote');
    const fullName =
      typeof data?.fullName === 'string' && data.fullName.trim()
        ? data.fullName.trim().slice(0, 200)
        : undefined;
    const user = await db.user.update({
      where: { id: userId },
      data: {
        fullName,
        role: role !== undefined && role !== current.role ? role : undefined,
        active: typeof data?.active === 'boolean' ? data.active : undefined,
      },
      select: SAFE,
    });
    return ipcSafe(user);
  });

  handle('users:resetPassword', async (ctx, id: unknown, newPassword: unknown) => {
    requireAdmin(ctx);
    const hash = await bcrypt.hash(password(newPassword), 10);
    const user = await getPrismaClient()
      .user.update({ where: { id: String(id ?? '') }, data: { password: hash }, select: SAFE })
      .catch(() => {
        throw new RefusedError('errors.notFound');
      });
    return ipcSafe(user);
  });
}
