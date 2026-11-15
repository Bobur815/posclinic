import type { LanJoinInput } from '../../shared/lan';
import type { LanService } from '../lan/lan-service';
import { handle, RefusedError, requireAdmin } from './ipc-safe';

/**
 * Settings → Satellite tills (main till, admins), the satellite's link status, and joining or
 * leaving a main till. Never sent over the LAN (lan/server.ts `runsOverLan`).
 */
export function setupLanHandlers(lan: LanService, isSetUpAsMain: () => Promise<boolean>): void {
  handle('lan:status', (ctx) => {
    requireAdmin(ctx);
    return lan.status();
  });
  handle('lan:update', (ctx, input: { enabled?: unknown; port?: unknown }) => {
    requireAdmin(ctx);
    return lan.update(input ?? {});
  });
  handle('lan:issueCode', (ctx) => {
    requireAdmin(ctx);
    return lan.issueCode();
  });
  handle('lan:cancelCode', (ctx) => {
    requireAdmin(ctx);
    return lan.cancelCode();
  });
  handle('lan:revoke', (ctx, deviceId: unknown) => {
    requireAdmin(ctx);
    return lan.revoke(deviceId);
  });

  handle('lan:link', () => lan.linkStatus());

  // Only a till that is not a clinic till yet (setup wizard): joining would hide its own data.
  handle('lan:join', async (_ctx, input: LanJoinInput) => {
    if (await isSetUpAsMain()) throw new RefusedError('lan.errors.alreadySetUp');
    return lan.join(input);
  });

  // A satellite holds no data, but leaving stops a desk: an admin, unless the main till itself
  // no longer accepts this satellite (revoked, another till, other version).
  handle('lan:leave', (ctx) => {
    if (!lan.mayLeaveUnattended) requireAdmin(ctx);
    return lan.leave();
  });
}
