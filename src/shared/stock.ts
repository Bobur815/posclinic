/**
 * Stock and expenses (v2.10): shared types and the money report.
 *
 * `buildFinanceReport` is pure: the till (`finance:report`) and the posclinic server
 * (`GET /api/reports/finance`) load the same rows for a period and pass them here, so the clinic
 * sees the same figures on the till and on the web dashboard.
 */

export type ProductCategory = 'SALE' | 'TREATMENT' | 'HOUSEHOLD';
export const PRODUCT_CATEGORIES: readonly ProductCategory[] = ['SALE', 'TREATMENT', 'HOUSEHOLD'];

/** IN delivery · SALE sold · TREATMENT used in a procedure · HOUSEHOLD written off · ADJUST stocktake · VOID delivery undone */
export type MovementType = 'IN' | 'SALE' | 'TREATMENT' | 'HOUSEHOLD' | 'ADJUST' | 'VOID';
export const MOVEMENT_TYPES: readonly MovementType[] = [
  'IN',
  'SALE',
  'TREATMENT',
  'HOUSEHOLD',
  'ADJUST',
  'VOID',
];

export type ExpenseCategory = 'RENT' | 'SALARY' | 'UTILITIES' | 'REPAIR' | 'TAX' | 'OTHER';
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'RENT',
  'SALARY',
  'UTILITIES',
  'REPAIR',
  'TAX',
  'OTHER',
];

/** Where the money came from: the open shift's cash drawer (a PAY_OUT) or outside it. */
export type PaidFrom = 'DRAWER' | 'OUTSIDE';
export const PAID_FROM: readonly PaidFrom[] = ['DRAWER', 'OUTSIDE'];

// ── Rows (field names from prisma/schema.sqlite.prisma) ─────────────────────────────────────

export interface ProductDto {
  id: string;
  name: string;
  category: ProductCategory;
  unit: string;
  barcode: string | null;
  minQty: number | null;
  qtyOnHand: number;
  avgCost: number;
  serviceId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  service?: { id: string; name: string; price: number } | null;
}

export interface ProductInput {
  name: string;
  category: ProductCategory;
  unit: string;
  barcode?: string | null;
  minQty?: number | null;
  /**
   * SALE only: the DIRECT_SALE service that sells it (one made before the stock page).
   * Left out = keep the current link; ignored for other categories (never sold).
   */
  serviceId?: string | null;
  /** SALE only: the sale price. No service yet = one is made at it; linked = its price is set. */
  salePrice?: number | null;
  active?: boolean;
}

export interface StockMovementDto {
  id: string;
  productId: string;
  type: MovementType;
  qty: number;
  unitCost: number;
  receiptId: string | null;
  itemId: string | null;
  sessionId: string | null;
  note: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  product?: { id: string; name: string; unit: string };
}

export interface StockReceiptDto {
  id: string;
  number: string;
  supplier: string | null;
  docNo: string | null;
  receivedAt: string;
  total: number;
  paidFrom: PaidFrom;
  cashMovementId: string | null;
  note: string;
  createdById: string | null;
  voidedAt: string | null;
  voidedById: string | null;
  createdAt: string;
  updatedAt: string;
  movements?: StockMovementDto[];
}

export interface ReceiptInput {
  /** Made by the page: the same id twice saves one delivery (a repeated submit, a retry). */
  id?: string;
  supplier?: string | null;
  docNo?: string | null;
  note?: string | null;
  paidFrom: PaidFrom;
  lines: Array<{ productId: string; qty: number; unitCost: number }>;
}

export interface WriteOffInput {
  productId: string;
  qty: number;
  note?: string | null;
}

export interface StocktakeInput {
  /** The counted quantity per product; only the ones that differ make a movement. */
  counts: Array<{ productId: string; counted: number }>;
  note?: string | null;
}

export interface ServiceSupplyDto {
  id: string;
  serviceId: string;
  productId: string;
  qty: number;
  product?: { id: string; name: string; unit: string };
}

export interface ExpenseDto {
  id: string;
  category: ExpenseCategory;
  amount: number;
  spentAt: string;
  note: string;
  paidFrom: PaidFrom;
  cashMovementId: string | null;
  createdById: string | null;
  voidedAt: string | null;
  voidedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseInput {
  /** Made by the page: the same id twice saves one expense. */
  id?: string;
  category: ExpenseCategory;
  amount: number;
  note?: string | null;
  paidFrom: PaidFrom;
  /** ISO date; default now. */
  spentAt?: string | null;
}

// ── The money report ───────────────────────────────────────────────────────────────────────

type Num = number | string | { toString(): string };
const n = (v: Num | null | undefined): number => (v == null ? 0 : Number(v.toString()));
/** Money to the tiyin, like src/main/clinic/shifts.ts. */
export const roundMoney = (v: number): number => Math.round(v * 100) / 100;

export interface FinanceInput {
  /** Payments taken in the period (cash basis). */
  payments: Array<{ method: string; amount: Num }>;
  /** Visits dated in the period (what was billed, what is still owed). */
  visits: Array<{
    status: string;
    totalAmount: Num;
    paidAmount: Num;
    items: Array<{ kind: string | null; total: Num; status?: string }>;
  }>;
  /** Stock movements made in the period. */
  movements: Array<{ type: string; qty: Num; unitCost: Num }>;
  /** Expenses spent in the period, not voided. */
  expenses: Array<{ category: string; amount: Num; paidFrom: string }>;
  /** Deliveries received in the period, not voided. */
  receipts: Array<{ total: Num; paidFrom: string }>;
  /** Every active product now (stock value and low stock). */
  products: Array<{
    id: string;
    name: string;
    unit: string;
    category: string;
    qtyOnHand: Num;
    avgCost: Num;
    minQty: Num | null;
  }>;
}

export interface FinanceReportDto {
  income: {
    /** Money taken (payments in the period). */
    total: number;
    byMethod: Record<string, number>;
    /** What the period's visits cost after discounts, and what is still unpaid of them. */
    billed: number;
    debt: number;
    /** Billed, by line kind (CONSULTATION, ANALYSIS, PROCEDURE, DIRECT_SALE). */
    byKind: Record<string, number>;
  };
  /** Cost of the products sold. */
  costOfSales: number;
  /** Cost of supplies used in procedures (TREATMENT) and written off (HOUSEHOLD). */
  suppliesUsed: { treatment: number; household: number; total: number };
  /** Stocktake: + missing (a cost), − found. */
  stockLoss: number;
  expenses: { total: number; byCategory: Record<string, number> };
  /** income − cost of sales − supplies used − stock loss − expenses */
  profit: number;
  /** Money that left the clinic in the period. */
  cashOut: {
    purchases: { drawer: number; outside: number; total: number };
    expenses: { drawer: number; outside: number; total: number };
    total: number;
  };
  /** income − cash out */
  netCash: number;
  stock: {
    value: number;
    products: number;
    low: Array<{ id: string; name: string; unit: string; qtyOnHand: number; minQty: number }>;
  };
}

function add(map: Record<string, number>, key: string, v: number) {
  map[key] = roundMoney((map[key] ?? 0) + v);
}

export function buildFinanceReport(input: FinanceInput): FinanceReportDto {
  const byMethod: Record<string, number> = {};
  let incomeTotal = 0;
  for (const p of input.payments) {
    incomeTotal += n(p.amount);
    add(byMethod, p.method, n(p.amount));
  }

  let billed = 0;
  let debt = 0;
  const byKind: Record<string, number> = {};
  for (const v of input.visits) {
    if (v.status === 'CANCELLED') continue;
    billed += n(v.totalAmount);
    debt += Math.max(0, n(v.totalAmount) - n(v.paidAmount));
    for (const i of v.items) {
      if (i.status === 'CANCELLED') continue;
      add(byKind, i.kind ?? 'OTHER', n(i.total));
    }
  }

  // Movement cost = −qty × unit cost (an out movement has a negative qty).
  let costOfSales = 0;
  let treatment = 0;
  let household = 0;
  let stockLoss = 0;
  for (const m of input.movements) {
    const cost = -n(m.qty) * n(m.unitCost);
    if (m.type === 'SALE') costOfSales += cost;
    else if (m.type === 'TREATMENT') treatment += cost;
    else if (m.type === 'HOUSEHOLD') household += cost;
    else if (m.type === 'ADJUST') stockLoss += cost;
  }

  const byCategory: Record<string, number> = {};
  let expensesTotal = 0;
  const expenseOut = { drawer: 0, outside: 0 };
  for (const e of input.expenses) {
    expensesTotal += n(e.amount);
    add(byCategory, e.category, n(e.amount));
    expenseOut[e.paidFrom === 'DRAWER' ? 'drawer' : 'outside'] += n(e.amount);
  }
  const purchaseOut = { drawer: 0, outside: 0 };
  for (const r of input.receipts) {
    purchaseOut[r.paidFrom === 'DRAWER' ? 'drawer' : 'outside'] += n(r.total);
  }

  let value = 0;
  const low: FinanceReportDto['stock']['low'] = [];
  for (const p of input.products) {
    const q = n(p.qtyOnHand);
    // Negative stock (sold before the delivery was entered) adds no value.
    if (q > 0) value += q * n(p.avgCost);
    if (p.minQty != null && q <= n(p.minQty)) {
      low.push({ id: p.id, name: p.name, unit: p.unit, qtyOnHand: q, minQty: n(p.minQty) });
    }
  }
  low.sort((a, b) => a.qtyOnHand - a.minQty - (b.qtyOnHand - b.minQty));

  const r = roundMoney;
  const income = r(incomeTotal);
  const suppliesTotal = r(treatment + household);
  const profit = r(income - costOfSales - suppliesTotal - stockLoss - expensesTotal);
  const purchases = {
    drawer: r(purchaseOut.drawer),
    outside: r(purchaseOut.outside),
    total: r(purchaseOut.drawer + purchaseOut.outside),
  };
  const expensesOut = {
    drawer: r(expenseOut.drawer),
    outside: r(expenseOut.outside),
    total: r(expenseOut.drawer + expenseOut.outside),
  };
  const cashOutTotal = r(purchases.total + expensesOut.total);
  return {
    income: { total: income, byMethod, billed: r(billed), debt: r(debt), byKind },
    costOfSales: r(costOfSales),
    suppliesUsed: { treatment: r(treatment), household: r(household), total: suppliesTotal },
    stockLoss: r(stockLoss),
    expenses: { total: r(expensesTotal), byCategory },
    profit,
    cashOut: { purchases, expenses: expensesOut, total: cashOutTotal },
    netCash: r(income - cashOutTotal),
    stock: { value: r(value), products: input.products.length, low },
  };
}
