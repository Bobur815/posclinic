import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dayRange, monthRange } from '../../common/dates';
import { aggregate, type VisitRow } from './report-core';

const doc = { id: 'd1', fullName: 'Dr A' };
const visit = (over: Partial<VisitRow>): VisitRow => ({
  status: 'COMPLETED',
  appointmentDate: new Date('2026-11-15T06:00:00Z'),
  totalAmount: 100,
  paidAmount: 100,
  doctor: doc,
  items: [{ serviceId: 's1', serviceName: 'Cons', quantity: 1, total: 100 }],
  ...over,
});

describe('report aggregation', () => {
  it('sums billed, paid and debt, leaving cancelled visits out', () => {
    const a = aggregate([
      visit({}),
      visit({ status: 'SCHEDULED', paidAmount: 40 }),
      visit({ status: 'CANCELLED', paidAmount: 0 }),
    ]);
    assert.equal(a.visits, 2);
    assert.equal(a.completed, 1);
    assert.equal(a.cancelled, 1);
    assert.equal(a.billed, 200);
    assert.equal(a.paid, 140);
    assert.equal(a.debt, 60);
    assert.deepEqual(a.byService, [{ id: 's1', name: 'Cons', count: 2, revenue: 200 }]);
    assert.equal(a.byDoctor[0].count, 2);
  });

  it('counts days in clinic time (UTC+5)', () => {
    // 20:00 UTC on the 14th is already the 15th in Tashkent.
    const a = aggregate([visit({ appointmentDate: new Date('2026-11-14T20:00:00Z') })]);
    assert.equal(a.byDay[0].date, '2026-11-15');
    const { from, to } = dayRange('2026-11-15');
    assert.equal(from.toISOString(), '2026-11-14T19:00:00.000Z');
    assert.equal(to.toISOString(), '2026-11-15T19:00:00.000Z');
    const m = monthRange('2026-12');
    assert.equal(m.to.toISOString(), '2026-12-31T19:00:00.000Z');
  });
});
