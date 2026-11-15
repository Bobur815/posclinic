import { clinicDay } from '../../common/dates';
import { money } from '../../common/serialize';

/**
 * Pure aggregation for the dashboard and reports. Cancelled visits count only in `cancelled`.
 * - `billed` = sum of totalAmount (bucket `revenue` is billed too);
 * - `paid` = sum of paidAmount (money received; what the till shows as revenue);
 * - `debt` = sum of max(0, total - paid).
 */

type Num = Parameters<typeof money>[0];

export interface VisitRow {
  status: string;
  appointmentDate: Date;
  totalAmount: Num;
  paidAmount: Num;
  doctor: { id: string; fullName: string } | null;
  items: { serviceId: string; serviceName: string; quantity: number; total: Num }[];
}

export interface Bucket {
  id: string;
  name: string;
  count: number;
  revenue: number;
}

export interface Aggregate {
  visits: number;
  completed: number;
  cancelled: number;
  billed: number;
  paid: number;
  debt: number;
  byDoctor: Bucket[];
  byService: Bucket[];
  byDay: { date: string; visits: number; revenue: number; paid: number; debt: number }[];
}

const round = (n: number) => Math.round(n * 100) / 100;

export function aggregate(rows: VisitRow[]): Aggregate {
  let visits = 0;
  let completed = 0;
  let cancelled = 0;
  let billed = 0;
  let paid = 0;
  let debt = 0;
  const doctors = new Map<string, Bucket>();
  const services = new Map<string, Bucket>();
  const days = new Map<string, { visits: number; revenue: number; paid: number; debt: number }>();

  for (const r of rows) {
    if (r.status === 'CANCELLED') {
      cancelled++;
      continue;
    }
    visits++;
    if (r.status === 'COMPLETED') completed++;
    const total = money(r.totalAmount);
    const got = money(r.paidAmount);
    const owed = Math.max(0, total - got);
    billed += total;
    paid += got;
    debt += owed;

    if (r.doctor) {
      const d = doctors.get(r.doctor.id) ?? {
        id: r.doctor.id,
        name: r.doctor.fullName,
        count: 0,
        revenue: 0,
      };
      d.count++;
      d.revenue += total;
      doctors.set(r.doctor.id, d);
    }
    for (const i of r.items) {
      const s = services.get(i.serviceId) ?? {
        id: i.serviceId,
        name: i.serviceName,
        count: 0,
        revenue: 0,
      };
      s.count += i.quantity;
      s.revenue += money(i.total);
      services.set(i.serviceId, s);
    }
    const day = clinicDay(r.appointmentDate);
    const b = days.get(day) ?? { visits: 0, revenue: 0, paid: 0, debt: 0 };
    b.visits++;
    b.revenue += total;
    b.paid += got;
    b.debt += owed;
    days.set(day, b);
  }

  const sorted = (m: Map<string, Bucket>) =>
    [...m.values()]
      .map((b) => ({ ...b, revenue: round(b.revenue) }))
      .sort((a, b) => b.revenue - a.revenue || b.count - a.count);

  return {
    visits,
    completed,
    cancelled,
    billed: round(billed),
    paid: round(paid),
    debt: round(debt),
    byDoctor: sorted(doctors),
    byService: sorted(services),
    byDay: [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, b]) => ({
        date,
        visits: b.visits,
        revenue: round(b.revenue),
        paid: round(b.paid),
        debt: round(b.debt),
      })),
  };
}
