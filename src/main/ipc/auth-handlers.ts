import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { normalizePhone } from '../../shared/phone';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';
import { type Actor, handle } from './ipc-safe';

function toActor(user: {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: string;
  clinicId: string | null;
}): Actor {
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    email: user.email,
    role: user.role,
    clinicId: user.clinicId,
  };
}

/**
 * The signed-in user as the database has them now: null once deactivated or deleted, with the
 * current role after a change (on the till or synced down from the web). Called before every
 * call, so a deactivated user is cut off at once, on the main till and on its satellites.
 */
export async function freshActor(actor: Actor | null): Promise<Actor | null> {
  if (!actor) return null;
  const user = await getPrismaClient().user.findUnique({ where: { id: actor.id } });
  return user?.active ? toActor(user) : null;
}

// ── Remember-me token ──────────────────────────────────────────────────────────────────────
// The renderer keeps a token so a restart does not sign the desk out. It is HMAC-signed with a
// secret only the main till's database holds: a satellite (or anyone) cannot forge one for
// another user. (Up to v2.1 it was an unsigned base64 user id; those are refused once.)

const SECRET_KEY = 'auth_secret';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function tokenSecret(): Promise<Buffer> {
  const prisma = getPrismaClient();
  const row = await prisma.setting.findUnique({ where: { key: SECRET_KEY } });
  if (row) return Buffer.from(JSON.parse(row.value) as string, 'hex');
  const secret = randomBytes(32).toString('hex');
  await prisma.setting.upsert({
    where: { key: SECRET_KEY },
    update: {},
    create: { key: SECRET_KEY, value: JSON.stringify(secret) },
  });
  const stored = await prisma.setting.findUniqueOrThrow({ where: { key: SECRET_KEY } });
  return Buffer.from(JSON.parse(stored.value) as string, 'hex');
}

async function signToken(userId: string): Promise<string> {
  const body = Buffer.from(JSON.stringify({ id: userId, iat: Date.now() })).toString('base64url');
  const mac = createHmac('sha256', await tokenSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${mac}`;
}

async function verifyToken(token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', await tokenSecret())
    .update(body)
    .digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      id?: unknown;
      iat?: unknown;
    };
    if (typeof p.id !== 'string' || typeof p.iat !== 'number') return null;
    if (Date.now() - p.iat > TOKEN_TTL_MS) return null;
    return p.id;
  } catch {
    return null;
  }
}

/**
 * Staff sign in with phone + password. No verification, no recovery flow on the till: a
 * forgotten password is reset by the clinic admin (Telegram login is planned). The signed-in
 * user belongs to the calling window (a satellite's window: a session on the main till).
 */
export function setupAuthHandlers(): void {
  handle('auth:login', async (ctx, rawPhone: unknown, password: unknown) => {
    try {
      const phone = typeof rawPhone === 'string' ? normalizePhone(rawPhone) : null;
      if (!phone || typeof password !== 'string') return { success: false, error: 'invalid_phone' };

      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({ where: { phone } });
      // Same answer for unknown phone and wrong password: don't reveal who has an account.
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return { success: false, error: 'invalid_credentials' };
      }
      if (!user.active) return { success: false, error: 'user_deactivated' };

      const actor = toActor(user);
      ctx.setActor(actor);
      log.info(`[auth] User logged in: ${user.id} (${user.role}) at ${ctx.terminalId || 'main'}`);
      return { success: true, user: actor, token: await signToken(user.id) };
    } catch (error) {
      log.error('[auth] Login error:', error);
      return { success: false, error: 'login_failed' };
    }
  });

  handle('auth:logout', async (ctx) => {
    ctx.setActor(null);
    return { success: true };
  });

  handle('auth:getProfile', async (ctx) => ctx.actor);

  handle('auth:restoreSession', async (ctx, token: unknown) => {
    try {
      const id = await verifyToken(token);
      if (!id) return null;
      const user = await getPrismaClient().user.findUnique({ where: { id } });
      if (!user || !user.active) return null;
      const actor = toActor(user);
      ctx.setActor(actor);
      return actor;
    } catch {
      return null;
    }
  });

  handle('auth:changePassword', async (ctx, currentPassword: unknown, newPassword: unknown) => {
    if (!ctx.actor || typeof currentPassword !== 'string') return false;
    if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 128) {
      return false;
    }
    try {
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({ where: { id: ctx.actor.id } });
      if (!user) return false;
      if (!(await bcrypt.compare(currentPassword, user.password))) return false;
      const hashed = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
      return true;
    } catch (error) {
      log.error('[auth] Change password error:', error);
      return false;
    }
  });
}
