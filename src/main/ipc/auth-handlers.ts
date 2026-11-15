import bcrypt from 'bcryptjs';
import { ipcMain } from 'electron';
import { normalizePhone } from '../../shared/phone';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';

interface AuthUser {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: string;
  clinicId: string | null;
}

let currentUser: AuthUser | null = null;

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

function toAuthUser(user: {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: string;
  clinicId: string | null;
}): AuthUser {
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
 * Staff sign in with phone + password. No verification, no recovery flow on the till: a
 * forgotten password is reset by the clinic admin (Telegram login is planned).
 */
export function setupAuthHandlers(): void {
  ipcMain.handle('auth:login', async (_event, rawPhone: string, password: string) => {
    try {
      const phone = normalizePhone(rawPhone);
      if (!phone) return { success: false, error: 'invalid_phone' };

      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({ where: { phone } });
      // Same answer for unknown phone and wrong password: don't reveal who has an account.
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return { success: false, error: 'invalid_credentials' };
      }
      if (!user.active) return { success: false, error: 'user_deactivated' };

      currentUser = toAuthUser(user);
      log.info(`[auth] User logged in: ${user.id} (${user.role})`);

      return {
        success: true,
        user: currentUser,
        token: Buffer.from(JSON.stringify({ id: user.id })).toString('base64'),
      };
    } catch (error) {
      log.error('[auth] Login error:', error);
      return { success: false, error: 'login_failed' };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    currentUser = null;
    return { success: true };
  });

  ipcMain.handle('auth:getProfile', async () => currentUser);

  ipcMain.handle('auth:restoreSession', async (_event, token: string) => {
    try {
      const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf-8')) as { id: string };
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({ where: { id: payload.id } });
      if (!user || !user.active) return null;
      currentUser = toAuthUser(user);
      return currentUser;
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    'auth:changePassword',
    async (_event, currentPassword: string, newPassword: string) => {
      if (!currentUser || typeof newPassword !== 'string' || newPassword.length < 6) return false;
      try {
        const prisma = getPrismaClient();
        const user = await prisma.user.findUnique({ where: { id: currentUser.id } });
        if (!user) return false;
        if (!(await bcrypt.compare(currentPassword, user.password))) return false;
        const hashed = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
        return true;
      } catch (error) {
        log.error('[auth] Change password error:', error);
        return false;
      }
    },
  );
}
