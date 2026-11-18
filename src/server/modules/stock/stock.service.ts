import { BadRequestException, Injectable } from '@nestjs/common';
import { buildFinanceReport, type FinanceReportDto } from '../../../shared/stock';
import { dayRange, paging } from '../../common/dates';
import { errorKey } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';

/** Longest period one report covers. */
const MAX_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

/** [from, to) for clinic-local days `from`..`to`, both included (default: today). */
export function periodRange(
  from?: string,
  to?: string,
  now = new Date(),
): { from: Date; to: Date } {
  const start = dayRange(from, now).from;
  const end = dayRange(to && to.length > 0 ? to : from, now).to;
  if (end <= start || end.getTime() - start.getTime() > MAX_DAYS * DAY_MS) {
    throw new BadRequestException(errorKey('invalid_date'));
  }
  return { from: start, to: end };
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Stock, expenses and the money report on the web (till v2.10). Read-only: everything is made on
 * the till and synced up. The report is the same pure function the till uses
 * (src/shared/stock.ts `buildFinanceReport`), so both show the same figures.
 */
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async products(clinicId: string, includeInactive = false) {
    const rows = await this.prisma.product.findMany({
      where: { clinicId, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return {
      items: rows.map(({ clinicId: _c, syncedAt: _s, ...p }) => ({
        ...p,
        minQty: num(p.minQty),
        qtyOnHand: Number(p.qtyOnHand),
        avgCost: Number(p.avgCost),
      })),
    };
  }

  async movements(
    clinicId: string,
    q: { productId?: string; from?: string; to?: string; page?: number; pageSize?: number },
  ) {
    const { from, to } = periodRange(q.from, q.to);
    const where = {
      clinicId,
      createdAt: { gte: from, lt: to },
      ...(q.productId ? { productId: q.productId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paging(q.page, q.pageSize),
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    // productId is a plain id (no foreign key): names come from this clinic's products only.
    const products = await this.prisma.product.findMany({
      where: { clinicId, id: { in: [...new Set(items.map((m) => m.productId))] } },
      select: { id: true, name: true, unit: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return {
      items: items.map(({ clinicId: _c, syncedAt: _s, ...m }) => ({
        ...m,
        qty: Number(m.qty),
        unitCost: Number(m.unitCost),
        product: byId.get(m.productId) ?? null,
      })),
      total,
    };
  }

  async expenses(
    clinicId: string,
    q: { from?: string; to?: string; page?: number; pageSize?: number },
  ) {
    const { from, to } = periodRange(q.from, q.to);
    const where = { clinicId, spentAt: { gte: from, lt: to } };
    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { spentAt: 'desc' },
        ...paging(q.page, q.pageSize),
      }),
      this.prisma.expense.count({ where }),
    ]);
    return {
      items: items.map(({ clinicId: _c, syncedAt: _s, ...e }) => ({
        ...e,
        amount: Number(e.amount),
      })),
      total,
    };
  }

  async finance(clinicId: string, fromDay?: string, toDay?: string): Promise<FinanceReportDto> {
    const { from, to } = periodRange(fromDay, toDay);
    const range = { gte: from, lt: to };
    const [payments, visits, services, movements, expenses, receipts, products] = await Promise.all(
      [
        this.prisma.payment.findMany({
          where: { clinicId, createdAt: range },
          select: { method: true, amount: true },
        }),
        this.prisma.appointment.findMany({
          where: { clinicId, appointmentDate: range },
          select: {
            status: true,
            totalAmount: true,
            paidAmount: true,
            items: { select: { serviceId: true, total: true, status: true } },
          },
        }),
        this.prisma.service.findMany({ where: { clinicId }, select: { id: true, kind: true } }),
        this.prisma.stockMovement.findMany({
          where: { clinicId, createdAt: range },
          select: { type: true, qty: true, unitCost: true },
        }),
        this.prisma.expense.findMany({
          where: { clinicId, spentAt: range, voidedAt: null },
          select: { category: true, amount: true, paidFrom: true },
        }),
        this.prisma.stockReceipt.findMany({
          where: { clinicId, receivedAt: range, voidedAt: null },
          select: { total: true, paidFrom: true },
        }),
        this.prisma.product.findMany({
          where: { clinicId, active: true },
          select: {
            id: true,
            name: true,
            unit: true,
            category: true,
            qtyOnHand: true,
            avgCost: true,
            minQty: true,
          },
        }),
      ],
    );
    const kind = new Map(services.map((s) => [s.id, s.kind]));
    return buildFinanceReport({
      payments,
      visits: visits.map((v) => ({
        ...v,
        items: v.items.map((i) => ({
          kind: kind.get(i.serviceId) ?? null,
          total: i.total,
          status: i.status,
        })),
      })),
      movements,
      expenses,
      receipts,
      products,
    });
  }
}
