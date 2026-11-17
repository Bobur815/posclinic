import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFiscalReceipt,
  type FiscalCodes,
  FiscalReceiptError,
  type FiscalVisitInput,
  serviceBarcode,
  vatValue,
} from './fiscal-receipt';

const codes = (vatMode: FiscalCodes['vatMode'] = 'nonPayer'): FiscalCodes => ({
  vatMode,
  byKind: {
    CONSULTATION: { mxik: '10902001034000000', packageCode: '1321927' },
    ANALYSIS: { mxik: '10902002003000999', packageCode: '1321964' },
    PROCEDURE: { mxik: '10902003035000000', packageCode: '1322001' },
    DIRECT_SALE: { mxik: '', packageCode: '' },
  },
});

const line = (over: Partial<FiscalVisitInput['lines'][number]> = {}) => ({
  serviceId: 's1',
  name: 'Konsultatsiya',
  kind: 'CONSULTATION',
  mxik: null,
  packageCode: null,
  quantity: 1,
  unitPrice: 150_000,
  discount: 0,
  total: 150_000,
  ...over,
});

const problem = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof FiscalReceiptError);
    return e.problem.reason;
  }
  assert.fail('expected a FiscalReceiptError');
};

describe('fiscal receipt of a paid visit', () => {
  it('one position per paid line, in tiyin, with the kind default codes; cash and card', () => {
    const r = buildFiscalReceipt(
      {
        lines: [
          line(),
          // A course of 10 paid upfront with a 10 % discount.
          line({
            serviceId: 's2',
            name: 'Klizma',
            kind: 'PROCEDURE',
            quantity: 10,
            unitPrice: 50_000,
            discount: 50_000,
            total: 450_000,
          }),
          // A free follow-up: not on the receipt.
          line({ serviceId: 's3', unitPrice: 0, total: 0 }),
        ],
        payments: [
          { method: 'CASH', amount: 400_000 },
          { method: 'CARD', amount: 200_000 },
        ],
      },
      codes(),
    );
    assert.deepEqual(r.positions, [
      {
        name: 'Konsultatsiya',
        barcode: serviceBarcode('s1'),
        icps: '10902001034000000',
        package_code: '1321927',
        amount: 15_000_000,
        quantity: 1000,
        vat_value: -1,
        discount: 0,
        owner_type: 'BuyingAndSelling',
      },
      {
        name: 'Klizma',
        barcode: serviceBarcode('s2'),
        icps: '10902003035000000',
        package_code: '1322001',
        amount: 50_000_000,
        quantity: 10_000,
        vat_value: -1,
        discount: 5_000_000,
        owner_type: 'BuyingAndSelling',
      },
    ]);
    assert.deepEqual(r.payments, [
      { type: 1, value: 40_000_000 },
      { type: 2, value: 20_000_000, card_type: 2 },
    ]);
  });

  it('a service’s own MXIK uses only its own package code', () => {
    const own = buildFiscalReceipt(
      {
        lines: [line({ mxik: '10902001099000000', packageCode: null })],
        payments: [{ method: 'CASH', amount: 150_000 }],
      },
      codes(),
    );
    assert.equal(own.positions[0]!.icps, '10902001099000000');
    assert.equal('package_code' in own.positions[0]!, false);
  });

  it('VAT 12 %: ceil(net x 12 / 112) of the line after its discount', () => {
    assert.equal(vatValue(15_000_000, 'vat12'), 1_607_143); // 1 607 142.86 -> up
    assert.equal(vatValue(11_200, 'vat12'), 1_200); // exact stays exact
    const r = buildFiscalReceipt(
      {
        lines: [line({ quantity: 2, unitPrice: 100_000, discount: 20_000, total: 180_000 })],
        payments: [{ method: 'CARD', amount: 180_000 }],
      },
      codes('vat12'),
    );
    assert.equal(r.positions[0]!.vat_value, vatValue(18_000_000, 'vat12'));
  });

  it('refuses what VCR would refuse, before asking it', () => {
    const pay = [{ method: 'CASH', amount: 150_000 }];
    assert.equal(
      problem(() =>
        buildFiscalReceipt({ lines: [line({ kind: 'DIRECT_SALE' })], payments: pay }, codes()),
      ),
      'NO_MXIK',
    );
    assert.equal(
      problem(() => buildFiscalReceipt({ lines: [line({ total: 0 })], payments: pay }, codes())),
      'EMPTY',
    );
    assert.equal(
      problem(() =>
        buildFiscalReceipt(
          {
            lines: [line()],
            payments: [
              { method: 'CASH', amount: 100_000 },
              { method: 'INSURANCE', amount: 50_000 },
            ],
          },
          codes(),
        ),
      ),
      'NOT_FISCAL_PAYMENT',
    );
    assert.equal(
      problem(() =>
        buildFiscalReceipt({ lines: [line({ total: 140_000 })], payments: pay }, codes()),
      ),
      'LINE_TOTAL',
    );
    assert.equal(
      problem(() =>
        buildFiscalReceipt(
          { lines: [line()], payments: [{ method: 'CASH', amount: 100_000 }] },
          codes(),
        ),
      ),
      'UNBALANCED',
    );
  });

  it('a service’s barcode is 8 digits and the same every time', () => {
    assert.match(serviceBarcode('clx1abc'), /^\d{8}$/);
    assert.equal(serviceBarcode('clx1abc'), serviceBarcode('clx1abc'));
    assert.notEqual(serviceBarcode('a'), serviceBarcode('b'));
  });
});
