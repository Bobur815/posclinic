import { randomUUID } from 'node:crypto';
import { log } from '../logger';
import { financeReport, createExpense, periodOf, voidExpense } from '../clinic/finance';
import { amountOf } from '../clinic/shifts';
import { categoryOf, qtyOf, receive, stocktake, voidReceipt, writeOff } from '../clinic/stock';
import { getPrismaClient } from '../database/sqlite-client';
import {
  ADMIN_ROLES,
  errorSummary,
  handle,
  type HandlerContext,
  ipcSafe,
  RefusedError,
} from './ipc-safe';

/**
 * Stock and expenses (v2.10), contract in src/shared/stock.ts.
 *
 * Who may do what (main enforces; the pages only hide controls):
 *  - see stock (products, history, deliveries): everyone signed in
 *  - receive a delivery: reception (from the drawer only) and admins
 *  - write off: reception, nurses and admins
 *  - products, supply lists, stocktake, voiding: admins
 *  - expenses: admins; reception only "paid from the drawer" (the cash they hand out)
 *  - the money report: admins
 * Logs carry ids and error kinds only.
 */

const RECEPTION = new Set(['RECEPTIONIST', ...ADMIN_ROLES]);
const WRITE_OFF = new Set(['RECEPTIONIST', 'NURSE', ...ADMIN_ROLES]);

function actor(ctx: HandlerContext, allowed?: ReadonlySet<string>) {
  if (!ctx.actor) throw new RefusedError('errors.notAuthenticated');
  if (allowed && !allowed.has(ctx.actor.role)) throw new RefusedError('errors.forbidden');
  return ctx.actor;
}

const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

type Tx = Parameters<Parameters<ReturnType<typeof getPrismaClient>['$transaction']>[0]>[0];

/** The next free `MAH-0001` code for a sale service made from the stock page. */
async function nextSaleCode(tx: Tx): Promise<string> {
  const used = await tx.service.findMany({
    where: { code: { startsWith: 'MAH-' } },
    select: { code: true },
  });
  const n = used.reduce((m, s) => Math.max(m, Number(s.code.slice(4)) || 0), 0);
  return `MAH-${String(n + 1).padStart(4, '0')}`;
}

/** Admin-only role set, for `actor()`. */
const ADMINS: ReadonlySet<string> = ADMIN_ROLES;

export function setupStockHandlers(): void {
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
  const db = () => getPrismaClient();

  // ── reads ──────────────────────────────────────────────────────────────────────────────

  handle(
    'stock:listProducts',
    run('stock:listProducts', async (ctx, filter?: { includeInactive?: unknown }) => {
      actor(ctx);
      return db().product.findMany({
        where: filter?.includeInactive === true ? {} : { active: true },
        include: { service: { select: { id: true, name: true, price: true } } },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      });
    }),
  );

  handle(
    'stock:movements',
    run('stock:movements', async (ctx, productId: unknown) => {
      actor(ctx);
      return db().stockMovement.findMany({
        where: { productId: String(productId ?? '') },
        orderBy: { createdAt: 'desc' },
        take: 300,
      });
    }),
  );

  handle(
    'stock:listReceipts',
    run('stock:listReceipts', async (ctx) => {
      actor(ctx);
      return db().stockReceipt.findMany({
        orderBy: { receivedAt: 'desc' },
        take: 200,
        include: {
          movements: {
            where: { type: 'IN' },
            include: { product: { select: { id: true, name: true, unit: true } } },
          },
        },
      });
    }),
  );

  handle(
    'stock:getSupplies',
    run('stock:getSupplies', async (ctx, serviceId: unknown) => {
      actor(ctx);
      return db().serviceSupply.findMany({
        where: { serviceId: String(serviceId ?? '') },
        include: { product: { select: { id: true, name: true, unit: true } } },
      });
    }),
  );

  // ── catalogue (admins) ─────────────────────────────────────────────────────────────────

  handle(
    'stock:saveProduct',
    run('stock:saveProduct', async (ctx, id: unknown, input: Record<string, unknown>) => {
      actor(ctx, ADMINS);
      const name = text(input?.name, 200);
      if (!name) throw new RefusedError('errors.invalidInput');
      const minQty =
        input?.minQty === null || input?.minQty === undefined || input?.minQty === ''
          ? null
          : qtyOf(input.minQty, { zero: true });
      const category = categoryOf(input?.category);
      // Only SALE products are sold. Their DIRECT_SALE service is what reception puts on the bill;
      // the page shows just the price: a new product gets a service made for it at that price,
      // a linked one has its service's price set to it.
      const salePrice =
        input?.salePrice === null || input?.salePrice === undefined || input?.salePrice === ''
          ? null
          : amountOf(input.salePrice, { zero: true });
      const editing = typeof id === 'string' && id ? id : null;
      return db().$transaction(async (tx) => {
        const found = editing ? await tx.product.findUnique({ where: { id: editing } }) : null;
        if (editing && !found) throw new RefusedError('errors.productNotFound');
        let serviceId: string | null = null;
        if (category === 'SALE') {
          // Not sent at all = keep the link it has.
          serviceId =
            input?.serviceId === undefined ? (found?.serviceId ?? null) : text(input.serviceId, 64);
          if (serviceId) {
            const s = await tx.service.findUnique({ where: { id: serviceId } });
            if (!s || s.kind !== 'DIRECT_SALE') {
              throw new RefusedError('errors.productServiceKind');
            }
            const taken = await tx.product.findUnique({ where: { serviceId } });
            if (taken && taken.id !== editing) throw new RefusedError('errors.productServiceTaken');
            if (salePrice !== null && Number(s.price) !== salePrice) {
              await tx.service.update({ where: { id: serviceId }, data: { price: salePrice } });
            }
          } else if (salePrice !== null) {
            const service = await tx.service.create({
              data: {
                id: randomUUID(),
                code: await nextSaleCode(tx),
                name,
                price: salePrice,
                kind: 'DIRECT_SALE',
              },
            });
            serviceId = service.id;
          }
        }
        const data = {
          name,
          category,
          unit: text(input?.unit, 20) ?? 'dona',
          barcode: text(input?.barcode, 64),
          minQty,
          serviceId,
          active: input?.active !== false,
        };
        if (editing) return tx.product.update({ where: { id: editing }, data });
        return tx.product.create({ data });
      });
    }),
  );

  /** The whole supply list of a procedure (or analysis) service, replaced as a set. */
  handle(
    'stock:setSupplies',
    run('stock:setSupplies', async (ctx, serviceId: unknown, list: unknown) => {
      actor(ctx, ADMINS);
      const sid = String(serviceId ?? '');
      const service = await db().service.findUnique({ where: { id: sid } });
      if (!service) throw new RefusedError('errors.notFound');
      if (service.kind === 'DIRECT_SALE') throw new RefusedError('errors.invalidInput');
      const rows = (Array.isArray(list) ? list : []).map((r: Record<string, unknown>) => ({
        productId: String(r?.productId ?? ''),
        qty: qtyOf(r?.qty),
      }));
      if (rows.length > 50 || new Set(rows.map((r) => r.productId)).size !== rows.length) {
        throw new RefusedError('errors.invalidInput');
      }
      return db().$transaction(async (tx) => {
        const found = await tx.product.count({
          where: { id: { in: rows.map((r) => r.productId) } },
        });
        if (found !== rows.length) throw new RefusedError('errors.productNotFound');
        await tx.serviceSupply.deleteMany({ where: { serviceId: sid } });
        for (const r of rows) await tx.serviceSupply.create({ data: { serviceId: sid, ...r } });
        return tx.serviceSupply.findMany({
          where: { serviceId: sid },
          include: { product: { select: { id: true, name: true, unit: true } } },
        });
      });
    }),
  );

  // ── movements ──────────────────────────────────────────────────────────────────────────

  handle(
    'stock:receive',
    run('stock:receive', async (ctx, input: Record<string, unknown>) => {
      const a = actor(ctx, RECEPTION);
      // Reception pays deliveries from the drawer it holds; "paid outside" is the owners' money.
      if (!ADMIN_ROLES.has(a.role) && input?.paidFrom !== 'DRAWER') {
        throw new RefusedError('errors.forbidden');
      }
      return db().$transaction((tx) => receive(tx, a.id, input));
    }),
  );

  handle(
    'stock:voidReceipt',
    run('stock:voidReceipt', async (ctx, id: unknown) => {
      const a = actor(ctx, ADMINS);
      return db().$transaction((tx) => voidReceipt(tx, a.id, String(id ?? '')));
    }),
  );

  handle(
    'stock:writeOff',
    run('stock:writeOff', async (ctx, input: Record<string, unknown>) => {
      const a = actor(ctx, WRITE_OFF);
      return db().$transaction((tx) => writeOff(tx, a.id, input));
    }),
  );

  handle(
    'stock:count',
    run('stock:count', async (ctx, input: Record<string, unknown>) => {
      const a = actor(ctx, ADMINS);
      return db().$transaction((tx) => stocktake(tx, a.id, input));
    }),
  );

  // ── expenses and the report ───────────────────────────────────────────────────────────

  handle(
    'expenses:list',
    run('expenses:list', async (ctx, filter?: { from?: unknown; to?: unknown }) => {
      const a = actor(ctx, RECEPTION);
      const { from, to } = periodOf(filter?.from, filter?.to);
      return db().expense.findMany({
        // Reception sees the cash it hands out, not salaries or rent paid by the owners.
        where: {
          spentAt: { gte: from, lt: to },
          ...(ADMIN_ROLES.has(a.role) ? {} : { paidFrom: 'DRAWER' }),
        },
        orderBy: { spentAt: 'desc' },
        take: 1000,
      });
    }),
  );

  handle(
    'expenses:create',
    run('expenses:create', async (ctx, input: Record<string, unknown>) => {
      const a = actor(ctx, RECEPTION);
      if (!ADMIN_ROLES.has(a.role) && input?.paidFrom !== 'DRAWER') {
        throw new RefusedError('errors.forbidden');
      }
      return db().$transaction((tx) =>
        createExpense(tx, a.id, input, { mayDate: ADMIN_ROLES.has(a.role) }),
      );
    }),
  );

  handle(
    'expenses:void',
    run('expenses:void', async (ctx, id: unknown) => {
      const a = actor(ctx, ADMINS);
      return db().$transaction((tx) => voidExpense(tx, a.id, String(id ?? '')));
    }),
  );

  handle(
    'finance:report',
    run('finance:report', async (ctx, filter?: { from?: unknown; to?: unknown }) => {
      actor(ctx, ADMINS);
      const { from, to } = periodOf(filter?.from, filter?.to);
      return financeReport(db(), from, to);
    }),
  );
}
