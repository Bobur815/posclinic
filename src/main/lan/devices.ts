import { randomUUID } from 'node:crypto';
import type { LanDeviceDto } from '../../shared/lan';
import type { LanDb } from './db';
import { hashSecret, newDeviceSecret, secretMatches } from './pairing';

/** The satellites paired with this main till (`lan_devices`; port of SavdoChef devices.ts). */

export class DeviceLimitError extends Error {
  constructor(readonly limit: number) {
    super('lan.errors.deviceLimit');
  }
}

function toDto(d: {
  id: string;
  name: string;
  ip: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  active: boolean;
}): LanDeviceDto {
  return {
    id: d.id,
    name: d.name,
    ip: d.ip,
    createdAt: d.createdAt.toISOString(),
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    active: d.active,
  };
}

export async function listDevices(db: LanDb): Promise<LanDeviceDto[]> {
  const rows = await db.lanDevice.findMany({
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map(toDto);
}

export function countActiveDevices(db: LanDb): Promise<number> {
  return db.lanDevice.count({ where: { active: true } });
}

/**
 * Pairs a new satellite. `limit` = satellites the licence allows (null = no limit). Returns the
 * id and the secret, which is never stored and never shown again. The pairing code is single
 * use, so two pairings never run at once and count-then-create cannot be raced.
 */
export async function createDevice(
  db: LanDb,
  name: string,
  ip: string | null,
  limit: number | null,
): Promise<{ id: string; secret: string }> {
  if (limit !== null && (await countActiveDevices(db)) >= limit) throw new DeviceLimitError(limit);
  const secret = newDeviceSecret();
  const id = randomUUID();
  await db.lanDevice.create({
    data: {
      id,
      name: name.slice(0, 60) || 'Satellite',
      secretHash: hashSecret(secret),
      ip,
    },
  });
  return { id, secret };
}

/** Revoked for good: the satellite has to pair again with a new code. */
export async function revokeDevice(db: LanDb, id: string): Promise<boolean> {
  const row = await db.lanDevice.findUnique({ where: { id } });
  if (!row) return false;
  if (row.active) await db.lanDevice.update({ where: { id }, data: { active: false } });
  return true;
}

/** How often lastSeenAt is written: once a minute is enough to show "online". */
const SEEN_EVERY_MS = 60_000;

const CREDENTIAL =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})$/;

/**
 * The device behind `<id>.<secret>`, or null. A revoked device or a wrong secret is null: the
 * caller answers 401 either way.
 */
export async function authenticateDevice(
  db: LanDb,
  credential: string,
  ip: string | null,
): Promise<{ id: string; name: string } | null> {
  const m = CREDENTIAL.exec(credential);
  if (!m) return null;
  const row = await db.lanDevice.findUnique({ where: { id: m[1]! } });
  if (!row || !row.active || !secretMatches(m[2]!, row.secretHash)) return null;
  const now = Date.now();
  if (!row.lastSeenAt || now - row.lastSeenAt.getTime() > SEEN_EVERY_MS || row.ip !== ip) {
    await db.lanDevice
      .update({ where: { id: row.id }, data: { lastSeenAt: new Date(now), ip } })
      .catch(() => undefined);
  }
  return { id: row.id, name: row.name };
}
