import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { StaffAccess } from '../../shared/clinic';
import { normalizePhone } from '../../shared/phone';
import { getPrismaClient } from '../database/sqlite-client';
import { isUniqueConflict } from './appointment-handlers';
import { checkLicence, handle, ipcSafe, RefusedError, requireAdmin } from './ipc-safe';
import { roleForAccess } from './types-handlers';

/**
 * Staff on the till (v2.5): receptionists, nurses / lab, admins, and the clinic's own staff types
 * (Settings → Types): a type's access decides the role, and a type without access (cleaner,
 * guard…) gives role STAFF: on the list, never signs in, takes no staff seat. A doctor's login is
 * made on the Doctors page. Admins only. Synced up as users.
 */

const ROLES = ['RECEPTIONIST', 'NURSE', 'CLINIC_ADMIN'] as const;
const SAFE = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
  role: true,
  active: true,
  staffTypeId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const canLogin = (role: string) => role !== 'STAFF';

function password(v: unknown): string {
  const p = typeof v === 'string' ? v : '';
  if (p.length < 6) throw new RefusedError('errors.passwordTooShort');
  // bcrypt reads 72 bytes; a longer password would be silently cut.
  if (p.length > 72) throw new RefusedError('errors.passwordTooLong');
  return p;
}

/** A no-login person still needs a hash in the column: one nobody knows. */
const unusableHash = () => bcrypt.hash(randomBytes(32).toString('hex'), 10);

function phoneTaken(e: unknown): never {
  if (isUniqueConflict(e, ['phone'])) throw new RefusedError('errors.phoneTaken');
  throw e;
}

type Db = ReturnType<typeof getPrismaClient>;

/**
 * The role and type a request asks for: `staffTypeId` (an active custom type, its access decides)
 * or a built-in `role`. undefined when the request changes neither.
 */
async function wanted(
  db: Db,
  data: Record<string, unknown>,
): Promise<{ role: string; staffTypeId: string | null } | undefined> {
  if (typeof data?.staffTypeId === 'string' && data.staffTypeId) {
    const type = await db.staffType.findUnique({ where: { id: data.staffTypeId } });
    if (!type || !type.active) throw new RefusedError('errors.invalidRole');
    return { role: roleForAccess(type.access as StaffAccess), staffTypeId: type.id };
  }
  if (data?.role === undefined) return undefined;
  const role = String(data.role);
  if (role === 'DOCTOR') throw new RefusedError('errors.useDoctorsPage');
  if (!(ROLES as readonly string[]).includes(role)) throw new RefusedError('errors.invalidRole');
  return { role, staffTypeId: null };
}

export function setupStaffHandlers(): void {
  /** Everyone on the staff list, doctors included (shown read-only), never the hash. */
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
    const db = getPrismaClient();
    const w = await wanted(db, data ?? {});
    if (!w) throw new RefusedError('errors.invalidRole');
    const fullName = typeof data?.fullName === 'string' ? data.fullName.trim().slice(0, 200) : '';
    if (!fullName) throw new RefusedError('errors.nameRequired');
    const phone = normalizePhone(typeof data?.phone === 'string' ? data.phone : null);
    if (!phone) throw new RefusedError('errors.invalidPhone');
    // Only someone who signs in takes one of the plan's staff seats.
    if (canLogin(w.role)) await checkLicence('staff:seat');
    const hash = canLogin(w.role)
      ? await bcrypt.hash(password(data?.password), 10)
      : await unusableHash();
    const user = await db.user
      .create({
        data: { id: randomUUID(), fullName, phone, password: hash, ...w },
        select: SAFE,
      })
      .catch(phoneTaken);
    return ipcSafe(user);
  });

  /**
   * Name, role or type, active. An admin never demotes or deactivates themself; doctors keep
   * DOCTOR. Becoming a signed-in user (switched on, or a no-login type given access) takes a
   * staff seat; from no login to login also needs a password.
   */
  handle('users:update', async (ctx, id: unknown, data: Record<string, unknown>) => {
    requireAdmin(ctx);
    const db = getPrismaClient();
    const userId = String(id ?? '');
    const current = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, active: true, doctor: { select: { id: true } } },
    });
    if (!current) throw new RefusedError('errors.notFound');
    const self = ctx.actor?.id === userId;

    const w = await wanted(db, data ?? {});
    if (w && w.role !== current.role) {
      if (self) throw new RefusedError('errors.selfDemote');
      if (current.doctor || current.role === 'DOCTOR')
        throw new RefusedError('errors.useDoctorsPage');
    }
    if (data?.active === false && self) throw new RefusedError('errors.selfDemote');

    const role = w?.role ?? current.role;
    const active = typeof data?.active === 'boolean' ? data.active : current.active;
    const wasSignedIn = canLogin(current.role) && current.active;
    const willSignIn = canLogin(role) && active;
    if (willSignIn && !wasSignedIn) await checkLicence('staff:seat');
    let hash: string | undefined;
    if (!canLogin(current.role) && canLogin(role)) {
      if (data?.password === undefined) throw new RefusedError('errors.passwordRequired');
      hash = await bcrypt.hash(password(data.password), 10);
    } else if (canLogin(current.role) && !canLogin(role)) {
      hash = await unusableHash(); // the old password must stop working
    }

    const fullName =
      typeof data?.fullName === 'string' && data.fullName.trim()
        ? data.fullName.trim().slice(0, 200)
        : undefined;
    const user = await db.user.update({
      where: { id: userId },
      data: {
        fullName,
        ...(w ? { role: w.role, staffTypeId: w.staffTypeId } : {}),
        active: typeof data?.active === 'boolean' ? data.active : undefined,
        ...(hash ? { password: hash } : {}),
      },
      select: SAFE,
    });
    return ipcSafe(user);
  });

  handle('users:resetPassword', async (ctx, id: unknown, newPassword: unknown) => {
    requireAdmin(ctx);
    const db = getPrismaClient();
    const target = await db.user.findUnique({
      where: { id: String(id ?? '') },
      select: { role: true },
    });
    if (!target) throw new RefusedError('errors.notFound');
    if (!canLogin(target.role)) throw new RefusedError('errors.noLoginType');
    const hash = await bcrypt.hash(password(newPassword), 10);
    const user = await db.user.update({
      where: { id: String(id) },
      data: { password: hash },
      select: SAFE,
    });
    return ipcSafe(user);
  });
}
