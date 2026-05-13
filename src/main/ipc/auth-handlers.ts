import { ipcMain } from 'electron';
import bcrypt from 'bcryptjs';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';

interface AuthUser {
  id: string;
  fullName: string;
  phone: string;
  role: string;
  clinicId: string | null;
}

let currentUser: AuthUser | null = null;

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

export function setupAuthHandlers(): void {
  ipcMain.handle('auth:login', async (_event, phone: string, password: string) => {
    try {
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({ where: { phone } });

      if (!user) {
        return { success: false, error: 'user_not_found' };
      }

      if (!user.active) {
        return { success: false, error: 'user_deactivated' };
      }

      const passwordValid = await bcrypt.compare(password, user.password);
      if (!passwordValid) {
        return { success: false, error: 'invalid_credentials' };
      }

      currentUser = {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        clinicId: user.clinicId,
      };

      log.info(`[auth] User logged in: ${user.phone} (${user.role})`);

      return {
        success: true,
        user: currentUser,
        token: Buffer.from(JSON.stringify({ id: user.id, role: user.role, phone: user.phone })).toString('base64'),
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

  ipcMain.handle('auth:getProfile', async () => {
    return currentUser;
  });

  ipcMain.handle('auth:restoreSession', async (_event, token: string) => {
    try {
      const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf-8')) as { id: string; role: string; phone: string };
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({ where: { id: payload.id } });

      if (!user || !user.active) {
        return null;
      }

      currentUser = {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        clinicId: user.clinicId,
      };

      return currentUser;
    } catch {
      return null;
    }
  });

  ipcMain.handle('auth:changePassword', async (_event, currentPassword: string, newPassword: string) => {
    if (!currentUser) return false;

    try {
      const prisma = getPrismaClient();
      const user = await prisma.user.findUnique({ where: { id: currentUser.id } });
      if (!user) return false;

      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return false;

      const hashed = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
      return true;
    } catch (error) {
      log.error('[auth] Change password error:', error);
      return false;
    }
  });
}
