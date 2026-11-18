import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PRINTER_CONFIG_DEFAULTS } from '../../shared/printing';
import {
  ageOn,
  applyReceiptLayout,
  buildPrescriptionHTML,
  hasPrescriptionContent,
  samplePrescription,
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
    assert.match(html, /ЛИСТ ЛЕЧЕНИЯ/);
    assert.match(html, /Лямблиоз/);
    assert.match(html, /2 раза в день/);
    // Only the sections with content, numbered in order: no course, no advice here.
    assert.match(html, /I\. Лекарственные средства/);
    assert.doesNotMatch(html, /Курс процедур|Рекомендации для дома/);
  });

  it('the A4 sheet ticks done sessions and leaves planned ones empty for the nurse', () => {
    const now = new Date('2026-11-18T10:00:00');
    const html = buildPrescriptionHTML(
      samplePrescription('uz'),
      { ...layout, language: 'uz' },
      'A4',
      now,
    );
    assert.match(html, /DAVOLASH VARAQASI/);
    assert.match(html, /II\. Muolajalar kursi/);
    assert.match(html, /III\. Uyda bajariladigan tavsiyalar/);
    assert.match(html, /3 \/ 10 bajarildi/);
    assert.match(html, /5 \/ 5 bajarildi/);
    assert.match(html, /5 kun, kuniga 1 marta/);
    // Ozon: 3 + Tomchi: 5 done boxes; 7 empty boxes; Tomchi's row padded with 5 blank cells.
    assert.equal(html.match(/class="s done"/g)?.length, 8);
    assert.equal(html.match(/<span class="ck"><\/span>/g)?.length, 7);
    assert.equal(html.match(/class="s na"/g)?.length, 5);
    assert.match(html, /Parhez: MUMKIN EMAS/);
    assert.match(html, /<li>Sut<\/li>/);
    assert.match(html, /62 kg \/ 165 sm/);
    assert.match(html, /12\.05\.1990 \(36 yosh\)/);
    assert.match(html, /Chop etildi: 18\.11\.2026 10:00/);
  });

  it('a long course wraps to rows of 10 boxes; every course and advice value is escaped', () => {
    const visit = {
      ...samplePrescription('ru'),
      courses: [
        {
          name: '<b>x</b>',
          perDay: 2,
          days: 6,
          sessions: Array.from({ length: 12 }, (_, i) => ({
            number: i + 1,
            plannedDate: null,
            doneAt: null,
          })),
        },
      ],
      recommendations: { dietAllowed: [], dietAvoid: [], home: ['<script>alert(1)</script>'] },
    };
    const html = buildPrescriptionHTML(visit, layout, 'A4');
    assert.equal(html.match(/<tr><td class="p">/g)?.length, 2);
    assert.match(html, /\(11–12\)/);
    assert.equal(html.match(/class="s na"/g)?.length, 8);
    assert.match(html, /6 дн\., 2 раз в день/);
    assert.doesNotMatch(html, /<script>|<b>x/);
    assert.match(html, /&lt;script&gt;/);
    // Advice only: no diet table.
    assert.doesNotMatch(html, /Диета: МОЖНО/);
  });

  it('the roll prescription lists course progress and the advice', () => {
    const html = buildPrescriptionHTML(samplePrescription('ru'), layout, '80');
    assert.match(html, /РЕЦЕПТ/);
    assert.match(html, /Озонотерапия/);
    assert.match(html, /3 \/ 10/);
    assert.match(html, /• Молоко/);
  });

  it('there is something to print with only a course or only advice', () => {
    const empty = { ...sampleVisit('ru') };
    assert.equal(hasPrescriptionContent(empty), false);
    assert.equal(
      hasPrescriptionContent({
        ...empty,
        recommendations: { dietAllowed: [], dietAvoid: [], home: ['x'] },
      }),
      true,
    );
    assert.equal(
      hasPrescriptionContent({ ...empty, courses: samplePrescription('ru').courses }),
      true,
    );
  });

  it('ages in Russian take the right word', () => {
    const now = new Date('2026-11-18T10:00:00');
    assert.equal(ageOn('1990-11-19T00:00:00', now), 35, 'birthday not reached yet');
    assert.equal(ageOn('2030-01-01T00:00:00', now), null);
    for (const [birth, word] of [
      ['2005-01-01', '21 год'],
      ['2004-01-01', '22 года'],
      ['2014-01-01', '12 лет'],
      ['1995-01-01', '31 год'],
    ]) {
      const html = buildPrescriptionHTML(
        { ...samplePrescription('ru'), patientBirthDate: `${birth}T00:00:00` },
        layout,
        'A4',
        now,
      );
      assert.ok(html.includes(`(${word})`), word);
    }
  });

  it('maps the case of appointments:getById: courses, sessions, advice by line', () => {
    const v = toPrintableVisit({
      appointmentNumber: 'A-2',
      appointmentDate: '2026-11-17T09:00:00.000Z',
      totalAmount: 0,
      discountAmount: 0,
      paidAmount: 0,
      diagnosis: null,
      patient: { fullName: 'P', patientCode: 'P-1' },
      items: [],
      case: {
        diagnosis: 'Case dx',
        recommendations: [
          { category: 'DIET_ALLOWED', text: '- Kefir\n\n• Grechka ' },
          { category: 'HOME', text: 'Off', active: false },
          { category: 'NOPE', text: 'Unknown category' },
        ],
        appointments: [
          {
            items: [
              {
                serviceName: 'Huqna',
                referral: { perDay: 1, days: 2 },
                sessions: [
                  { number: 2, plannedDate: '2026-11-19T09:00:00.000Z', doneAt: null },
                  {
                    number: 1,
                    plannedDate: '2026-11-18T09:00:00.000Z',
                    doneAt: '2026-11-18T10:00:00.000Z',
                  },
                ],
              },
              {
                serviceName: 'Cancelled',
                status: 'CANCELLED',
                sessions: [{ number: 1, plannedDate: null, doneAt: null }],
              },
              { serviceName: 'Consultation', sessions: [] },
            ],
          },
        ],
        vitals: [{ weightKg: '70.5', heightCm: null }],
      },
    });
    assert.equal(v.diagnosis, 'Case dx');
    assert.deepEqual(v.recommendations.dietAllowed, ['Kefir', 'Grechka']);
    assert.deepEqual(v.recommendations.home, []);
    assert.deepEqual(
      v.courses.map((c) => [c.name, c.perDay, c.sessions.map((s) => s.number)]),
      [['Huqna', 1, [1, 2]]],
    );
    assert.equal(v.weightKg, 70.5);
    assert.equal(v.heightCm, null);
  });

  it('a course is whole on the sheet from the referral on, before and while it is registered', () => {
    const base = {
      appointmentNumber: 'A-3',
      appointmentDate: '2026-11-18T09:00:00.000Z',
      totalAmount: 0,
      discountAmount: 0,
      paidAmount: 0,
      patient: { fullName: 'P', patientCode: 'P-1' },
      items: [],
    };
    const referral = {
      id: 'r1',
      status: 'PENDING',
      quantity: 6,
      perDay: 2,
      days: 3,
      service: { name: 'Huqna' },
    };
    // Just referred: nothing registered or paid yet, every box is there and empty.
    const fresh = toPrintableVisit({ ...base, case: { referrals: [referral] } });
    assert.ok(hasPrescriptionContent(fresh));
    assert.deepEqual(
      fresh.courses.map((c) => [c.name, c.perDay, c.days, c.sessions.length]),
      [['Huqna', 2, 3, 6]],
    );
    assert.ok(fresh.courses[0].sessions.every((s) => s.plannedDate === null && s.doneAt === null));
    const html = buildPrescriptionHTML(fresh, layout, 'A4');
    assert.equal((html.match(/<td class="s">/g) ?? []).length, 6);
    assert.ok(html.includes('0 / 6'));

    // Registered in two orders (4 + 2 later), one ticked; a line without a referral stays its own.
    const s = (number: number, day: number, done = false) => ({
      number,
      plannedDate: `2026-11-${day}T09:00:00.000Z`,
      doneAt: done ? `2026-11-${day}T10:00:00.000Z` : null,
    });
    const v = toPrintableVisit({
      ...base,
      case: {
        referrals: [{ ...referral, status: 'PARTIAL' }],
        appointments: [
          {
            items: [
              {
                referralId: 'r1',
                serviceName: 'Huqna',
                sessions: [s(2, 18), s(1, 18, true), s(3, 19), s(4, 19)],
              },
              { serviceName: 'Massaj', sessions: [s(1, 20)] },
            ],
          },
          { items: [{ referralId: 'r1', serviceName: 'Huqna', sessions: [s(1, 21)] }] },
        ],
      },
    });
    assert.deepEqual(
      v.courses.map((c) => [c.name, c.sessions.map((x) => x.number)]),
      [
        ['Huqna', [1, 2, 3, 4, 5, 6]],
        ['Massaj', [1]],
      ],
    );
    const huqna = v.courses[0].sessions;
    assert.equal(huqna[0].doneAt, '2026-11-18T10:00:00.000Z');
    assert.equal(huqna[4].plannedDate, '2026-11-21T09:00:00.000Z');
    assert.equal(huqna[5].plannedDate, null);
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
