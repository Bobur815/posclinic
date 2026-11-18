import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { ShiftSummaryDto } from '../../shared/clinic';
import type {
  ExpenseDto,
  FinanceReportDto,
  ProductDto,
  StockMovementDto,
  StockReceiptDto,
} from '../../shared/stock';
import { useDatabaseClient } from '../database/sqlite-client';
import { createTestDb, type TestDb } from '../test-utils/db';
import { setupIpcHandlers } from './handlers';
import {
  type Actor,
  clearHandlers,
  configureHandlers,
  type HandlerContext,
  invokeHandler,
} from './ipc-safe';

/**
 * Stock and money (v2.10) through the real handlers and a real SQLite file: deliveries and the
 * average cost, a sale leaving stock only when the visit is paid in full, a procedure's supplies
 * per ticked session (and back on undo), write-offs, a stocktake, voids, expenses, the drawer,
 * and one money report whose every figure is worked out by hand below.
 */

let t: TestDb;
const mk = (role: string, id: string, phone: string): Actor => ({
  id,
  fullName: role,
  phone,
  email: null,
  role,
  clinicId: null,
});
const admin = mk('CLINIC_ADMIN', 'admin-1', '+998900000001');
const desk = mk('RECEPTIONIST', 'desk-1', '+998900000002');
const nurse = mk('NURSE', 'nurse-1', '+998900000003');
const doctor = mk('DOCTOR', 'doc-1', '+998900000004');
const as =
  (a: Actor) =>
  <R>(channel: string, ...args: unknown[]) =>
    invokeHandler(
      channel,
      { actor: a, setActor: () => undefined, terminalId: 'T1' } as HandlerContext,
      args,
    ) as Promise<R>;
const refusedWith = (p: Promise<unknown>, key: string) =>
  assert.rejects(p, (e: Error) => e.message === key);

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

let shiftId: string;
let drug: ProductDto; // SALE, sold through the DIRECT_SALE service
let solution: ProductDto; // TREATMENT, used by the procedure (ml)
let wipes: ProductDto; // HOUSEHOLD
let drawerReceipt: StockReceiptDto;
let wipesReceipt: StockReceiptDto;
let saleVisit: string;
let procVisit: string;
let sessions: string[];

const product = async (id: string) =>
  (await as(admin)<ProductDto[]>('stock:listProducts')).find((p) => p.id === id) as ProductDto;

before(async () => {
  t = await createTestDb();
  useDatabaseClient(t.db);
  clearHandlers();
  setupIpcHandlers();
  configureHandlers({ gate: async () => null, onWrite: () => undefined, emit: () => undefined });
  for (const u of [admin, desk, nurse, doctor]) {
    await t.db.user.create({
      data: { id: u.id, phone: u.phone, password: 'x', role: u.role, fullName: u.fullName },
    });
  }
  await t.db.service.createMany({
    data: [
      { id: 's-drug', code: 'DRUG', name: 'Albendazol', price: 15_000, kind: 'DIRECT_SALE' },
      { id: 's-proc', code: 'PROC', name: 'Huqna', price: 50_000, kind: 'PROCEDURE' },
    ],
  });
  const p = await t.db.patient.create({
    data: { patientCode: 'P-1', fullName: 'Patient', phone: '+998901000001' },
  });
  // A sale of 2 packs, and a course of 2 procedure sessions.
  saleVisit = (
    await t.db.appointment.create({
      data: {
        appointmentNumber: 'A-1',
        patientId: p.id,
        appointmentDate: new Date(),
        totalAmount: 30_000,
        items: {
          create: [
            {
              serviceId: 's-drug',
              serviceName: 'Albendazol',
              quantity: 2,
              unitPrice: 15_000,
              total: 30_000,
            },
          ],
        },
      },
    })
  ).id;
  const proc = await t.db.appointment.create({
    data: {
      appointmentNumber: 'A-2',
      patientId: p.id,
      appointmentDate: new Date(),
      totalAmount: 100_000,
      items: {
        create: [
          {
            serviceId: 's-proc',
            serviceName: 'Huqna',
            quantity: 2,
            unitPrice: 50_000,
            total: 100_000,
            sessions: { create: [{ number: 1 }, { number: 2 }] },
          },
        ],
      },
    },
    include: { items: { include: { sessions: { orderBy: { number: 'asc' } } } } },
  });
  procVisit = proc.id;
  sessions = proc.items[0].sessions.map((s) => s.id);
});

after(async () => {
  useDatabaseClient(null);
  await t.close();
});

describe('stock and money (v2.10)', () => {
  it('admins keep the product list; a sold product is tied to its DIRECT_SALE service', async () => {
    drug = await as(admin)<ProductDto>('stock:saveProduct', null, {
      name: 'Albendazol 400',
      category: 'SALE',
      unit: 'quti',
      serviceId: 's-drug',
    });
    solution = await as(admin)<ProductDto>('stock:saveProduct', null, {
      name: 'Eritma',
      category: 'TREATMENT',
      unit: 'ml',
      minQty: 700,
    });
    wipes = await as(admin)<ProductDto>('stock:saveProduct', null, {
      name: 'Salfetka',
      category: 'HOUSEHOLD',
    });
    await refusedWith(
      as(desk)('stock:saveProduct', null, { name: 'x', category: 'SALE' }),
      'errors.forbidden',
    );
    await refusedWith(
      as(admin)('stock:saveProduct', null, { name: 'x', category: 'SALE', serviceId: 's-proc' }),
      'errors.productServiceKind',
    );
    await refusedWith(
      as(admin)('stock:saveProduct', null, { name: 'x', category: 'SALE', serviceId: 's-drug' }),
      'errors.productServiceTaken',
    );
    await refusedWith(
      as(admin)('stock:saveProduct', null, { name: 'x', category: 'FOOD' }),
      'errors.invalidInput',
    );
    // A product without a sale service yet gets one made for it.
    const cream = await as(admin)<ProductDto>('stock:saveProduct', null, {
      name: 'Krem',
      category: 'SALE',
      salePrice: 25_000,
    });
    const made = await t.db.service.findUnique({ where: { id: cream.serviceId as string } });
    assert.deepEqual(
      [made?.kind, made?.name, Number(made?.price), made?.code],
      ['DIRECT_SALE', 'Krem', 25_000, 'MAH-0001'],
    );
    // Editing: the link is kept when not sent, and the price goes to its service.
    const edited = await as(admin)<ProductDto>('stock:saveProduct', cream.id, {
      name: 'Krem',
      category: 'SALE',
      salePrice: 27_000,
    });
    assert.equal(edited.serviceId, cream.serviceId);
    const repriced = await t.db.service.findUnique({ where: { id: cream.serviceId as string } });
    assert.equal(Number(repriced?.price), 27_000);
    assert.equal(await t.db.service.count({ where: { code: { startsWith: 'MAH-' } } }), 1);
    // Only SALE products are sold: a household item never gets or keeps a sale service.
    const plain = await as(admin)<ProductDto>('stock:saveProduct', null, {
      name: 'Qog‘oz',
      category: 'HOUSEHOLD',
      serviceId: 's-drug',
      salePrice: 1_000,
    });
    assert.equal(plain.serviceId, null);
    assert.equal(await t.db.service.count({ where: { code: { startsWith: 'MAH-' } } }), 1);
    // 150 ml of solution per session of the procedure.
    await as(admin)('stock:setSupplies', 's-proc', [{ productId: solution.id, qty: 150 }]);
    await refusedWith(
      as(admin)('stock:setSupplies', 's-drug', [{ productId: solution.id, qty: 1 }]),
      'errors.invalidInput',
    );
  });

  it('deliveries set the weighted average cost; one paid from the drawer is a cash-out', async () => {
    // Reception pays from the drawer it holds; "outside" is the owners' money.
    await refusedWith(
      as(desk)('stock:receive', {
        paidFrom: 'OUTSIDE',
        lines: [{ productId: drug.id, qty: 1, unitCost: 1 }],
      }),
      'errors.forbidden',
    );
    await as(admin)('stock:receive', {
      paidFrom: 'OUTSIDE',
      supplier: 'Farm',
      lines: [{ productId: drug.id, qty: 10, unitCost: 10_000 }],
    });
    // From the drawer needs an open shift.
    await refusedWith(
      as(desk)('stock:receive', {
        paidFrom: 'DRAWER',
        lines: [{ productId: drug.id, qty: 1, unitCost: 1 }],
      }),
      'errors.noOpenShift',
    );
    shiftId = (
      await t.db.shift.create({ data: { status: 'OPEN', openGuard: 1, openingCash: 500_000 } })
    ).id;
    await refusedWith(
      as(desk)('stock:receive', {
        paidFrom: 'DRAWER',
        lines: [{ productId: drug.id, qty: 1000, unitCost: 10_000 }],
      }),
      'errors.payOutExceedsCash',
    );
    const delivery = {
      id: 'delivery-0000-1',
      paidFrom: 'DRAWER',
      lines: [
        { productId: drug.id, qty: 10, unitCost: 14_000 },
        { productId: solution.id, qty: 1000, unitCost: 20 },
      ],
    };
    drawerReceipt = await as(desk)<StockReceiptDto>('stock:receive', delivery);
    // The same submit again (a double click, a satellite retry): saved once, paid once.
    const again = await as(desk)<StockReceiptDto>('stock:receive', delivery);
    assert.equal(again.id, drawerReceipt.id);
    assert.equal(await t.db.stockReceipt.count({ where: { id: delivery.id } }), 1);
    assert.equal(drawerReceipt.total, 160_000);
    assert.equal(drawerReceipt.number, 'K-000002');
    wipesReceipt = await as(admin)<StockReceiptDto>('stock:receive', {
      paidFrom: 'DRAWER',
      lines: [{ productId: wipes.id, qty: 10, unitCost: 3_000 }],
    });
    await refusedWith(
      as(nurse)('stock:receive', {
        paidFrom: 'OUTSIDE',
        lines: [{ productId: wipes.id, qty: 1, unitCost: 1 }],
      }),
      'errors.forbidden',
    );
    await refusedWith(
      as(admin)('stock:receive', {
        paidFrom: 'OUTSIDE',
        lines: [{ productId: drug.id, qty: 0, unitCost: 1 }],
      }),
      'errors.invalidStockQty',
    );

    const d = await product(drug.id);
    assert.equal(d.qtyOnHand, 20);
    assert.equal(d.avgCost, 12_000, '(10 × 10 000 + 10 × 14 000) / 20');
  });

  it('a sale leaves stock only when the visit is paid in full', async () => {
    await as(desk)('appointments:checkout', saleVisit, { paymentMethod: 'CASH', amount: 10_000 });
    assert.equal((await product(drug.id)).qtyOnHand, 20, 'partly paid: still in stock');
    await as(desk)('appointments:checkout', saleVisit, { paymentMethod: 'CASH', amount: 20_000 });
    const d = await product(drug.id);
    assert.equal(d.qtyOnHand, 18);
    const moves = await as(admin)<StockMovementDto[]>('stock:movements', drug.id);
    const sale = moves.find((m) => m.type === 'SALE');
    assert.deepEqual([sale?.qty, sale?.unitCost], [-2, 12_000]);
  });

  it('each ticked session uses the supplies; an undo gives exactly that back', async () => {
    await as(desk)('appointments:checkout', procVisit, { paymentMethod: 'CARD', amount: 100_000 });
    await as(nurse)('sessions:tick', sessions[0]);
    assert.equal((await product(solution.id)).qtyOnHand, 850);
    await as(nurse)('sessions:tick', sessions[0], true);
    assert.equal((await product(solution.id)).qtyOnHand, 1000);
    await as(nurse)('sessions:tick', sessions[0]);
    await as(nurse)('sessions:tick', sessions[1]);
    const s = await product(solution.id);
    assert.equal(s.qtyOnHand, 700);
    assert.equal(s.avgCost, 20, 'a return comes back at the cost it went out');
  });

  it('write-offs (reception, nurses, admins), a stocktake and a void', async () => {
    await as(nurse)('stock:writeOff', { productId: solution.id, qty: 50, note: 'to‘kildi' });
    await refusedWith(
      as(doctor)('stock:writeOff', { productId: solution.id, qty: 1 }),
      'errors.forbidden',
    );
    await refusedWith(
      as(desk)('stock:count', { counts: [{ productId: drug.id, counted: 1 }] }),
      'errors.forbidden',
    );
    await refusedWith(
      as(admin)('stock:count', {
        counts: [
          { productId: drug.id, counted: 1 },
          { productId: drug.id, counted: 2 },
        ],
      }),
      'errors.invalidInput',
    );
    const adj = await as(admin)<StockMovementDto[]>('stock:count', {
      counts: [
        { productId: drug.id, counted: 17 },
        { productId: solution.id, counted: 650 },
      ],
    });
    assert.deepEqual(
      adj.map((m) => [m.productId, m.qty]),
      [[drug.id, -1]],
      'only what differs',
    );

    await as(admin)('stock:voidReceipt', wipesReceipt.id);
    await refusedWith(as(admin)('stock:voidReceipt', wipesReceipt.id), 'errors.alreadyVoided');
    await refusedWith(as(desk)('stock:voidReceipt', drawerReceipt.id), 'errors.forbidden');
    const w = await product(wipes.id);
    assert.equal(w.qtyOnHand, 0);
  });

  it('expenses: reception only from the drawer; a void puts the money back', async () => {
    await refusedWith(
      as(desk)('expenses:create', { category: 'RENT', amount: 1_000, paidFrom: 'OUTSIDE' }),
      'errors.forbidden',
    );
    // Cash from the drawer leaves now: a date the desk sends is not taken.
    const lastYear = new Date(Date.now() - 365 * 86_400_000).toISOString();
    const desks = {
      id: 'expense-0000-1',
      category: 'OTHER',
      amount: 5_000,
      paidFrom: 'DRAWER',
      note: 'Suv',
      spentAt: lastYear,
    };
    const water0 = await as(desk)<ExpenseDto>('expenses:create', desks);
    assert.ok(Date.now() - new Date(water0.spentAt).getTime() < 60_000, 'dated now');
    assert.equal(
      (await as(desk)<ExpenseDto>('expenses:create', desks)).id,
      water0.id,
      'saved once',
    );
    await refusedWith(
      as(admin)('expenses:create', {
        category: 'RENT',
        amount: 1,
        paidFrom: 'OUTSIDE',
        spentAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      }),
      'errors.invalidInput',
    );
    await as(admin)('expenses:create', {
      category: 'RENT',
      amount: 1_000_000,
      paidFrom: 'OUTSIDE',
    });
    const water = await as(admin)<ExpenseDto>('expenses:create', {
      category: 'UTILITIES',
      amount: 7_000,
      paidFrom: 'DRAWER',
    });
    await as(admin)('expenses:void', water.id);
    await refusedWith(as(desk)('expenses:void', water.id), 'errors.forbidden');
    await refusedWith(
      as(admin)('expenses:create', { category: 'NOPE', amount: 1, paidFrom: 'OUTSIDE' }),
      'errors.invalidInput',
    );
    // Reception sees the cash it hands out, not the rent the owners pay.
    const list = await as(desk)<ExpenseDto[]>('expenses:list', { from: today, to: today });
    assert.deepEqual(list.map((e) => e.category).sort(), ['OTHER', 'UTILITIES']);
    const all = await as(admin)<ExpenseDto[]>('expenses:list', { from: today, to: today });
    assert.equal(all.length, 3);
    await refusedWith(
      as(admin)('expenses:list', { from: '2020-01-01', to: '2026-12-31' }),
      'errors.invalidInput',
    );
  });

  it('the money report adds up to the tiyin', async () => {
    await refusedWith(as(desk)('finance:report', { from: today, to: today }), 'errors.forbidden');
    const r = await as(admin)<FinanceReportDto>('finance:report', { from: today, to: today });
    assert.equal(r.income.total, 130_000);
    assert.deepEqual(r.income.byMethod, { CASH: 30_000, CARD: 100_000 });
    assert.equal(r.income.billed, 130_000);
    assert.equal(r.income.debt, 0);
    assert.deepEqual(r.income.byKind, { DIRECT_SALE: 30_000, PROCEDURE: 100_000 });
    assert.equal(r.costOfSales, 24_000, '2 × 12 000');
    assert.deepEqual(r.suppliesUsed, { treatment: 6_000, household: 1_000, total: 7_000 });
    assert.equal(r.stockLoss, 12_000, 'one pack missing at the stocktake');
    assert.deepEqual(r.expenses, {
      total: 1_005_000,
      byCategory: { OTHER: 5_000, RENT: 1_000_000 },
    });
    assert.equal(r.profit, 130_000 - 24_000 - 7_000 - 12_000 - 1_005_000);
    assert.deepEqual(r.cashOut, {
      purchases: { drawer: 160_000, outside: 100_000, total: 260_000 },
      expenses: { drawer: 5_000, outside: 1_000_000, total: 1_005_000 },
      total: 1_265_000,
    });
    assert.equal(r.netCash, 130_000 - 1_265_000);
    assert.equal(r.stock.value, 17 * 12_000 + 650 * 20);
    assert.deepEqual(
      r.stock.low.map((x) => [x.name, x.qtyOnHand]),
      [['Eritma', 650]],
    );
  });

  it('the drawer still adds up', async () => {
    const s = await as(desk)<ShiftSummaryDto>('shifts:summary', shiftId);
    // opening + cash sales + back in (wipes delivery, water) − out (delivery, wipes, two expenses)
    assert.equal(s.payIn, 30_000 + 7_000);
    assert.equal(s.payOut, 160_000 + 30_000 + 5_000 + 7_000);
    assert.equal(s.expectedCash, 500_000 + 30_000 + 37_000 - 202_000);
  });
});
