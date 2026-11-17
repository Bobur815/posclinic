import { getFiscalService } from '../fiscal/registry';
import { log } from '../logger';
import {
  errorSummary,
  handle,
  type HandlerContext,
  RefusedError,
  requireAdmin,
  requireReception,
} from './ipc-safe';

/**
 * Fiscal receipts (v2.6, REGOS:VCR). Settings, connection test and the Z-report buttons are for
 * admins; the status, "send again" and the fiscal copy are for reception too (they take the
 * money). Everything runs on the main till; a satellite's calls are forwarded there.
 */
export function setupFiscalHandlers(): void {
  const service = () => {
    const s = getFiscalService();
    if (!s) throw new RefusedError('errors.fiscalOff');
    return s;
  };
  const run =
    <A extends unknown[], R>(
      name: string,
      who: (ctx: HandlerContext) => void,
      fn: (...args: A) => Promise<R>,
    ) =>
    async (ctx: HandlerContext, ...args: A) => {
      who(ctx);
      try {
        return await fn(...args);
      } catch (error) {
        log.error(`[${name}]`, errorSummary(error));
        throw error;
      }
    };

  handle(
    'fiscal:status',
    run('fiscal:status', requireReception, async () => {
      const s = getFiscalService();
      return s ? s.status() : { enabled: false, pending: 0, failed: 0 };
    }),
  );
  handle('fiscal:getConfig', run('fiscal:getConfig', requireAdmin, () => service().getConfig()));
  handle(
    'fiscal:setConfig',
    run('fiscal:setConfig', requireAdmin, (input: unknown) => service().setConfig(input)),
  );
  handle('fiscal:test', run('fiscal:test', requireAdmin, () => service().testConnection()));
  handle(
    'fiscal:retry',
    run('fiscal:retry', requireReception, (id: unknown) => service().retry(String(id ?? ''))),
  );
  handle('fiscal:retryAll', run('fiscal:retryAll', requireReception, () => service().retryAll()));
  handle(
    'fiscal:duplicate',
    run('fiscal:duplicate', requireReception, async (id: unknown) => {
      await service().duplicate(String(id ?? ''));
      return true;
    }),
  );
  handle(
    'fiscal:zReport',
    run('fiscal:zReport', requireReception, async () => {
      const s = getFiscalService();
      return s ? s.zReport() : null;
    }),
  );
  handle('fiscal:zOpen', run('fiscal:zOpen', requireAdmin, () => service().zOpen()));
  handle('fiscal:zClose', run('fiscal:zClose', requireAdmin, () => service().zClose()));
}
