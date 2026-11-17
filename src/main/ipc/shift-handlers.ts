import type { ShiftCloseResultDto } from '../../shared/clinic';
import {
  addCashMovement,
  closeShift,
  deleteShift,
  getOpenShift,
  listShifts,
  openShift,
  shiftSummary,
} from '../clinic/shifts';
import { getPrismaClient } from '../database/sqlite-client';
import { log } from '../logger';
import {
  errorSummary,
  handle,
  ipcSafe,
  RefusedError,
  requireAdmin,
  requireReception,
  type HandlerContext,
} from './ipc-safe';

/**
 * What else happens when a shift opens or closes: REGOS:VCR's Z-report follows the shift (fiscal,
 * wired in index.ts on the main till). Neither ever undoes the shift.
 */
export interface ShiftHooks {
  afterOpen(shiftId: string): void;
  /** Sends the waiting receipts and closes the Z-report; what went wrong, or null. */
  afterClose(shiftId: string): Promise<string | null>;
}

let hooks: ShiftHooks = {
  afterOpen: () => undefined,
  afterClose: async () => null,
};

export function configureShiftHooks(next: Partial<ShiftHooks>): void {
  hooks = { ...hooks, ...next };
}

function signedIn(ctx: HandlerContext) {
  if (!ctx.actor) throw new RefusedError('errors.notAuthenticated');
  return ctx.actor;
}

/**
 * Cash shifts (v2.6). Everyone signed in sees whether a shift is open (checkout says so); the
 * drawer's figures and every change are for reception and admins, who take the money; deleting
 * an empty shift is for admins.
 */
export function setupShiftHandlers(): void {
  const run =
    <A extends unknown[], R>(name: string, fn: (ctx: HandlerContext, ...args: A) => Promise<R>) =>
    async (ctx: HandlerContext, ...args: A) => {
      try {
        return ipcSafe(await fn(ctx, ...args));
      } catch (error) {
        log.error(`[${name}]`, errorSummary(error));
        throw error;
      }
    };

  handle(
    'shifts:getOpen',
    run('shifts:getOpen', async (ctx) => {
      signedIn(ctx);
      return getOpenShift(getPrismaClient());
    }),
  );

  handle(
    'shifts:list',
    run('shifts:list', async (ctx, limit?: unknown) => {
      requireReception(ctx);
      return listShifts(getPrismaClient(), Number(limit) || 30);
    }),
  );

  handle(
    'shifts:summary',
    run('shifts:summary', async (ctx, id: unknown) => {
      requireReception(ctx);
      return shiftSummary(getPrismaClient(), String(id ?? ''));
    }),
  );

  handle(
    'shifts:open',
    run('shifts:open', async (ctx, input: { openingCash?: unknown }) => {
      requireReception(ctx);
      const shift = await openShift(getPrismaClient(), signedIn(ctx).id, input ?? {});
      hooks.afterOpen(shift.id);
      return shift;
    }),
  );

  handle(
    'shifts:addCashMovement',
    run(
      'shifts:addCashMovement',
      async (ctx, input: { type?: unknown; amount?: unknown; note?: unknown }) => {
        requireReception(ctx);
        return addCashMovement(getPrismaClient(), signedIn(ctx).id, input ?? {});
      },
    ),
  );

  handle(
    'shifts:close',
    run(
      'shifts:close',
      async (
        ctx,
        input: { shiftId?: unknown; countedCash?: unknown },
      ): Promise<ShiftCloseResultDto> => {
        requireReception(ctx);
        const shift = await closeShift(getPrismaClient(), signedIn(ctx).id, input ?? {});
        // In the background: sending the waiting receipts and closing VCR's Z-report can take
        // longer than a satellite's call may wait, and the shift is closed either way. What VCR
        // could not do shows on the Z-report panel (waiting receipts, Z still open).
        void hooks.afterClose(shift.id).then(
          (problem) => problem && log.warn(`[shifts:close] fiscal: ${problem}`),
          (e: unknown) => log.warn('[shifts:close] after-close step failed', errorSummary(e)),
        );
        return { shift };
      },
    ),
  );

  handle(
    'shifts:delete',
    run('shifts:delete', async (ctx, id: unknown) => {
      requireAdmin(ctx);
      await deleteShift(getPrismaClient(), id);
      return true;
    }),
  );
}
