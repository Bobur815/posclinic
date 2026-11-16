import { randomUUID } from 'node:crypto';
import {
  SERVICE_KINDS,
  STAFF_ACCESS,
  type ServiceKind,
  type StaffAccess,
} from '../../shared/clinic';
import { getPrismaClient } from '../database/sqlite-client';
import { handle, ipcSafe, RefusedError, requireAdmin } from './ipc-safe';

/**
 * Settings → Types (v2.5): order types and staff types the clinic adds. An order type has one of
 * the fixed behaviours (its services follow it); a staff type has an access level (its users'
 * role follows it: NONE = role STAFF, no login). Types are never deleted, only switched off.
 */

/** The role a staff type gives its users. */
export function roleForAccess(access: StaffAccess): string {
  return access === 'NONE' ? 'STAFF' : access;
}

const text = (v: unknown, max = 100): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

function color(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v))
    throw new RefusedError('errors.invalidColor');
  return v.toLowerCase();
}

export function setupTypesHandlers(): void {
  /** Both lists, active first; anyone signed in (registration, Staff, Services pages read them). */
  handle('types:list', async (ctx) => {
    if (!ctx.actor) throw new RefusedError('errors.notAuthenticated');
    const db = getPrismaClient();
    const [serviceTypes, staffTypes] = await Promise.all([
      db.serviceType.findMany({
        orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { nameUz: 'asc' }],
      }),
      db.staffType.findMany({ orderBy: [{ active: 'desc' }, { nameUz: 'asc' }] }),
    ]);
    return ipcSafe({ serviceTypes, staffTypes });
  });

  /** Create (no id) or update an order type; a new behaviour moves its services with it. */
  handle('types:saveServiceType', async (ctx, data: Record<string, unknown>) => {
    requireAdmin(ctx);
    const nameUz = text(data?.nameUz);
    if (!nameUz) throw new RefusedError('errors.nameRequired');
    const behavior = String(data?.behavior ?? '') as ServiceKind;
    if (!SERVICE_KINDS.includes(behavior)) throw new RefusedError('errors.invalidServiceKind');
    const fields = {
      nameUz,
      nameRu: text(data?.nameRu),
      behavior,
      color: color(data?.color),
      sortOrder: Number.isInteger(data?.sortOrder) ? (data.sortOrder as number) : 0,
      active: data?.active !== false,
    };
    const db = getPrismaClient();
    const id = typeof data?.id === 'string' && data.id ? data.id : null;
    const saved = await db.$transaction(async (tx) => {
      if (!id) return tx.serviceType.create({ data: { id: randomUUID(), ...fields } });
      const current = await tx.serviceType.findUnique({ where: { id } });
      if (!current) throw new RefusedError('errors.notFound');
      const t = await tx.serviceType.update({ where: { id }, data: fields });
      if (current.behavior !== behavior) {
        // Its services now behave the new way; type-specific fields follow (as on the Services page).
        await tx.service.updateMany({
          where: { serviceTypeId: id },
          data: {
            kind: behavior,
            ...(behavior !== 'CONSULTATION' ? { isFollowUp: false } : {}),
            ...(behavior !== 'ANALYSIS'
              ? { resultType: null, resultUnit: null, referenceRange: null }
              : {}),
          },
        });
        if (behavior === 'ANALYSIS') {
          await tx.service.updateMany({
            where: { serviceTypeId: id, resultType: null },
            data: { resultType: 'QUALITATIVE' },
          });
        }
      }
      return t;
    });
    return ipcSafe(saved);
  });

  /** Create or update a staff type; a new access level changes its users' role. */
  handle('types:saveStaffType', async (ctx, data: Record<string, unknown>) => {
    requireAdmin(ctx);
    const nameUz = text(data?.nameUz);
    if (!nameUz) throw new RefusedError('errors.nameRequired');
    const access = String(data?.access ?? '') as StaffAccess;
    if (!STAFF_ACCESS.includes(access)) throw new RefusedError('errors.invalidRole');
    const fields = { nameUz, nameRu: text(data?.nameRu), access, active: data?.active !== false };
    const db = getPrismaClient();
    const id = typeof data?.id === 'string' && data.id ? data.id : null;
    const saved = await db.$transaction(async (tx) => {
      if (!id) return tx.staffType.create({ data: { id: randomUUID(), ...fields } });
      const current = await tx.staffType.findUnique({ where: { id } });
      if (!current) throw new RefusedError('errors.notFound');
      if (current.access !== access) {
        // An admin never takes their own access away (as on the Staff page).
        const self = ctx.actor?.id
          ? await tx.user.findFirst({ where: { id: ctx.actor.id, staffTypeId: id } })
          : null;
        if (self && access !== 'CLINIC_ADMIN') throw new RefusedError('errors.selfDemote');
        await tx.user.updateMany({
          where: { staffTypeId: id },
          data: { role: roleForAccess(access) },
        });
      }
      return tx.staffType.update({ where: { id }, data: fields });
    });
    return ipcSafe(saved);
  });
}
