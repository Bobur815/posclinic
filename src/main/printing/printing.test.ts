import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PRINTER_CONFIG_DEFAULTS } from '../../shared/printing';
import {
  applyReceiptLayout,
  buildPrescriptionHTML,
  buildSampleReceiptHTML,
  buildTestPageHTML,
  buildVisitReceiptHTML,
  RECEIPT_LAYOUT_DEFAULTS,
  readReceiptLayout,
  sampleVisit,
  toPrintableVisit,
} from '../../shared/receipt-html';
import { PrintQueue, PrintTimeoutError } from './print-queue';
import { readPrinterConfig, writePrinterConfig } from './printer-config';
import { getReceiptLayout, RECEIPT_LAYOUT_KEY, setReceiptLayout } from './receipt-layout';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('receipt HTML', () => {
  const layout = { ...RECEIPT_LAYOUT_DEFAULTS, clinicName: 'Shifo', language: 'ru' as const };

  it('prints the visit lines, discount, payments and what is left to pay', () => {
    const visit = { ...sampleVisit('ru'), paidAmount: 300000 };
    const html = buildVisitReceiptHTML(visit, layout, '80');
    assert.match(html, /Shifo/);
    assert.match(html, /Консультация паразитолога/);
    assert.match(html, /Скидка/);
    assert.match(html, /Наличные/);
    assert.match(html, /Остаток/);
    assert.match(html, /90 000 сум/); // 390 000 - 300 000
    assert.match(html, /size: 80mm auto/);
  });

  it('escapes every value (no markup from the database reaches the page)', () => {
    const visit = { ...sampleVisit('uz'), patientName: '<img src=x onerror=alert(1)>' };
    const html = buildVisitReceiptHTML(visit, { ...layout, clinicName: '"><script>' }, '58');
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;img src=x/);
    assert.match(html, /Content-Security-Policy/);
  });

  it('hides what the layout unticks', () => {
    const html = buildVisitReceiptHTML(
      sampleVisit('uz'),
      { ...layout, showPatient: false, showPayments: false, showClinicName: false },
      '80',
    );
    assert.doesNotMatch(html, /Aliyev|Иванов/);
    assert.doesNotMatch(html, /Наличные/);
    assert.doesNotMatch(html, /Shifo/);
  });

  it('prints only base64 image logos', () => {
    const good = buildVisitReceiptHTML(sampleVisit('ru'), { ...layout, logoTop: PNG }, '80');
    assert.ok(good.includes(PNG));
    const bad = buildVisitReceiptHTML(
      sampleVisit('ru'),
      { ...layout, logoTop: 'https://evil.example/x.png' },
      '80',
    );
    assert.doesNotMatch(bad, /evil\.example/);
  });

  it('prescription on A4 carries diagnosis and the prescription text', () => {
    const visit = {
      ...sampleVisit('ru'),
      diagnosis: 'Лямблиоз',
      prescription: 'Таблетки\n2 раза в день',
    };
    const html = buildPrescriptionHTML(visit, layout, 'A4');
    assert.match(html, /size: A4/);
    assert.match(html, /РЕЦЕПТ/);
    assert.match(html, /Лямблиоз/);
    assert.match(html, /2 раза в день/);
  });

  it('test page and preview build', () => {
    assert.match(buildTestPageHTML(layout, '58', 'XP-58'), /XP-58/);
    assert.match(buildSampleReceiptHTML(layout, '80'), /padding: 2mm 3mm !important/);
  });

  it('builds a printable visit from appointments:getById, skipping cancelled lines', () => {
    const v = toPrintableVisit({
      appointmentNumber: 'A-1',
      appointmentDate: '2026-11-17T09:00:00.000Z',
      totalAmount: 100,
      discountAmount: 0,
      paidAmount: '100',
      fiscalStatus: 'PENDING',
      fiscalReceiptNo: '77',
      patient: { fullName: 'P', patientCode: 'C' },
      doctor: null,
      items: [
        { serviceName: 'a', quantity: 1, unitPrice: 100, total: 100, status: 'DONE' },
        { serviceName: 'b', quantity: 1, unitPrice: 50, total: 50, status: 'CANCELLED' },
      ],
      payments: [{ method: 'CARD', amount: '100', createdBy: { fullName: 'Kassir' } }],
    });
    assert.equal(v.lines.length, 1);
    assert.equal(v.paidAmount, 100);
    assert.equal(v.cashierName, 'Kassir');
    assert.equal(v.fiscalReceiptNo, null); // only a fiscalised receipt's number is printed
  });
});

describe('receipt layout', () => {
  it('refuses bad fields and keeps good ones', () => {
    assert.deepEqual(applyReceiptLayout(RECEIPT_LAYOUT_DEFAULTS, { language: 'en' }), {
      invalid: 'language',
    });
    assert.deepEqual(applyReceiptLayout(RECEIPT_LAYOUT_DEFAULTS, { logoTop: 'javascript:x' }), {
      invalid: 'logoTop',
    });
    assert.deepEqual(applyReceiptLayout(RECEIPT_LAYOUT_DEFAULTS, { logoTopSize: 5 }), {
      invalid: 'logoTopSize',
    });
    const ok = applyReceiptLayout(RECEIPT_LAYOUT_DEFAULTS, {
      clinicName: '  Shifo  ',
      showDoctor: false,
      logoBottom: PNG,
      nonsense: 1,
    });
    assert.ok(!('invalid' in ok));
    assert.equal(ok.clinicName, 'Shifo');
    assert.equal(ok.showDoctor, false);
    assert.equal(ok.logoBottom, PNG);
  });

  it('reads a damaged stored value field by field', () => {
    const l = readReceiptLayout({ language: 'xx', footer: 'Bye', showStir: 'no' });
    assert.equal(l.language, RECEIPT_LAYOUT_DEFAULTS.language);
    assert.equal(l.footer, 'Bye');
    assert.equal(l.showStir, true);
  });

  it('is stored in settings and starts with the clinic name', async () => {
    const rows = new Map<string, string>();
    const db = {
      setting: {
        findUnique: async ({ where }: { where: { key: string } }) =>
          rows.has(where.key) ? { value: rows.get(where.key)! } : null,
        upsert: async (a: { where: { key: string }; create: { value: string } }) => {
          rows.set(a.where.key, a.create.value);
        },
      },
      localConfig: { findFirst: async () => ({ clinicName: 'Shifo Med' }) },
    };
    assert.equal((await getReceiptLayout(db)).clinicName, 'Shifo Med');
    await setReceiptLayout(db, { footer: 'Rahmat' });
    assert.equal(JSON.parse(rows.get(RECEIPT_LAYOUT_KEY)!).footer, 'Rahmat');
    assert.equal((await getReceiptLayout(db)).clinicName, 'Shifo Med');
    await assert.rejects(setReceiptLayout(db, { phone: 5 }), /errors\.invalidSetting/);
  });
});

describe('printer config (per PC)', () => {
  it('defaults, saves and refuses bad values', () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'posclinic-print-')),
      'printer.json',
    );
    assert.deepEqual(readPrinterConfig(file), PRINTER_CONFIG_DEFAULTS);
    writePrinterConfig(file, { receiptPrinter: 'XP-80', paperWidth: '58', cashDrawer: true });
    assert.deepEqual(readPrinterConfig(file), {
      receiptPrinter: 'XP-80',
      paperWidth: '58',
      documentPrinter: '',
      cashDrawer: true,
    });
    assert.throws(() => writePrinterConfig(file, { paperWidth: '100' }), /invalidSetting/);
    assert.throws(() => writePrinterConfig(file, { receiptPrinter: 'a\nb' }), /invalidSetting/);
    fs.writeFileSync(file, '{ broken');
    assert.deepEqual(readPrinterConfig(file), PRINTER_CONFIG_DEFAULTS);
  });
});

describe('print queue', () => {
  it('runs jobs one at a time, in order, and goes on after a failure', async () => {
    const q = new PrintQueue(1000);
    const order: string[] = [];
    let running = 0;
    const job =
      (name: string, fail = false) =>
      async () => {
        running++;
        assert.equal(running, 1);
        await new Promise((r) => setTimeout(r, 5));
        order.push(name);
        running--;
        if (fail) throw new Error(name);
        return name;
      };
    const results = await Promise.allSettled([
      q.run(job('a')),
      q.run(job('b', true)),
      q.run(job('c')),
    ]);
    assert.deepEqual(order, ['a', 'b', 'c']);
    assert.equal(results[1].status, 'rejected');
    assert.equal(results[2].status, 'fulfilled');
    assert.equal(q.pending, 0);
  });

  it('gives up a job that hangs, and the next one still prints', async () => {
    const q = new PrintQueue(20);
    const hung = q.run(() => new Promise(() => undefined));
    const next = q.run(async () => 'next');
    await assert.rejects(hung, PrintTimeoutError);
    assert.equal(await next, 'next');
  });
});
