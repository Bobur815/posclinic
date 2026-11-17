/**
 * The till's printed documents as HTML (port of SavdoChef/posgro `shared/receipt-html.ts`):
 * the visit receipt (thermal roll, 80 or 58 mm), the prescription (roll or A4), the test page and
 * the sample shown live in Settings → Receipt. Pure functions, no Node/Electron: main prints
 * them (src/main/printing) and the renderer previews them in an iframe.
 *
 * Every value from the database or a setting is escaped; images are accepted only as base64
 * image data URLs. The print window runs no JavaScript.
 */
import { formatPhone } from './phone';

export type ReceiptLanguage = 'ru' | 'uz';
export type PaperWidth = '80' | '58';
/** A prescription goes on the receipt roll, or on A4 when this PC has a document printer. */
export type DocumentPaper = PaperWidth | 'A4';

/**
 * Clinic-wide receipt layout (Settings → Receipt), kept on the main till (`settings` key
 * `receipt_layout`); a satellite prints with its main till's layout.
 */
export interface ReceiptLayout {
  language: ReceiptLanguage;
  clinicName: string;
  address: string;
  phone: string;
  /** STIR (tax id) */
  stir: string;
  /** Extra line under the clinic block. */
  header: string;
  /** Last line; empty = "Thank you, stay healthy!" */
  footer: string;
  /** Base64 image data URL above the clinic block ('' = none). */
  logoTop: string;
  /** Width in % of the paper, 10–100. */
  logoTopSize: number;
  logoBottom: string;
  logoBottomSize: number;
  showClinicName: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showStir: boolean;
  showPatient: boolean;
  showDoctor: boolean;
  showCashier: boolean;
  showPayments: boolean;
}

export const RECEIPT_LAYOUT_DEFAULTS: ReceiptLayout = {
  language: 'uz',
  clinicName: '',
  address: '',
  phone: '',
  stir: '',
  header: '',
  footer: '',
  logoTop: '',
  logoTopSize: 50,
  logoBottom: '',
  logoBottomSize: 50,
  showClinicName: true,
  showAddress: true,
  showPhone: true,
  showStir: true,
  showPatient: true,
  showDoctor: true,
  showCashier: true,
  showPayments: true,
};

export const RECEIPT_SHOW_KEYS = [
  'showClinicName',
  'showAddress',
  'showPhone',
  'showStir',
  'showPatient',
  'showDoctor',
  'showCashier',
  'showPayments',
] as const;
export type ReceiptShowKey = (typeof RECEIPT_SHOW_KEYS)[number];

const TEXT_KEYS = ['clinicName', 'address', 'phone', 'stir', 'header', 'footer'] as const;
const TEXT_MAX = 200;

/** Only base64 image data URLs are printed; anything else is dropped. */
export const LOGO_DATA_URL_RE = /^data:image\/(png|jpeg|gif|webp|bmp);base64,[A-Za-z0-9+/=]+$/;
/** A logo's data URL may be this long at most (the layout crosses the LAN to satellites). */
export const LOGO_MAX_CHARS = 200 * 1024;

function logoOk(v: unknown): v is string {
  return (
    typeof v === 'string' && (v === '' || (v.length <= LOGO_MAX_CHARS && LOGO_DATA_URL_RE.test(v)))
  );
}
function sizeOk(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 10 && v <= 100;
}

/**
 * `base` with the valid fields of `patch` applied. Returns the name of the first invalid field
 * instead, so a setter can refuse it (the stored value never holds a bad field).
 */
export function applyReceiptLayout(
  base: ReceiptLayout,
  patch: Record<string, unknown>,
): ReceiptLayout | { invalid: string } {
  const out: ReceiptLayout = { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (v === undefined) continue;
    if (k === 'language') {
      if (v !== 'ru' && v !== 'uz') return { invalid: k };
      out.language = v;
    } else if ((TEXT_KEYS as readonly string[]).includes(k)) {
      if (typeof v !== 'string' || v.length > TEXT_MAX) return { invalid: k };
      out[k as (typeof TEXT_KEYS)[number]] = v.trim();
    } else if (k === 'logoTop' || k === 'logoBottom') {
      if (!logoOk(v)) return { invalid: k };
      out[k] = v;
    } else if (k === 'logoTopSize' || k === 'logoBottomSize') {
      if (!sizeOk(v)) return { invalid: k };
      out[k] = v;
    } else if ((RECEIPT_SHOW_KEYS as readonly string[]).includes(k)) {
      if (typeof v !== 'boolean') return { invalid: k };
      out[k as ReceiptShowKey] = v;
    }
    // Unknown keys are ignored.
  }
  return out;
}

/** A stored layout read leniently: every bad or missing field falls back to its default. */
export function readReceiptLayout(stored: unknown): ReceiptLayout {
  const out: ReceiptLayout = { ...RECEIPT_LAYOUT_DEFAULTS };
  if (!stored || typeof stored !== 'object') return out;
  for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
    const one = applyReceiptLayout(out, { [k]: v });
    if (!('invalid' in one)) Object.assign(out, one);
  }
  return out;
}

// ── What is printed ─────────────────────────────────────────────────────────────────────────

export interface PrintableLine {
  name: string;
  quantity: number;
  unitPrice: number;
  /** Money off this line; `total` is after it. */
  discount: number;
  total: number;
}

/** A visit as the printers need it (built from `appointments:getById`, `toPrintableVisit`). */
export interface PrintableVisit {
  appointmentNumber: string;
  /** ISO */
  date: string;
  patientName: string;
  patientCode: string;
  /** ISO or null */
  patientBirthDate: string | null;
  doctorName: string | null;
  doctorSpecialty: string | null;
  lines: PrintableLine[];
  /** After discounts. */
  totalAmount: number;
  discountAmount: number;
  paidAmount: number;
  /** CASH | CARD | TRANSFER | INSURANCE */
  payments: Array<{ method: string; amount: number }>;
  cashierName: string | null;
  fiscalReceiptNo: string | null;
  diagnosis: string | null;
  prescription: string | null;
}

/** The shape of `appointments:getById` that the printers read (Decimals already numbers). */
export interface PrintSourceAppointment {
  appointmentNumber: string;
  appointmentDate: string | Date;
  totalAmount: number | string;
  discountAmount: number | string;
  paidAmount: number | string;
  fiscalStatus?: string | null;
  fiscalReceiptNo?: string | null;
  diagnosis?: string | null;
  prescription?: string | null;
  patient: { fullName: string; patientCode: string; birthDate?: string | Date | null } | null;
  doctor?: { fullName: string; specialty?: string | null } | null;
  items: Array<{
    serviceName: string;
    quantity: number;
    unitPrice: number | string;
    discount?: number | string | null;
    total: number | string;
    status?: string;
  }>;
  payments?: Array<{
    method: string;
    amount: number | string;
    createdBy?: { fullName: string } | null;
  }>;
}

const iso = (d: string | Date | null | undefined): string | null =>
  d == null ? null : d instanceof Date ? d.toISOString() : String(d);

export function toPrintableVisit(a: PrintSourceAppointment): PrintableVisit {
  const payments = a.payments ?? [];
  return {
    appointmentNumber: a.appointmentNumber,
    date: iso(a.appointmentDate) ?? new Date().toISOString(),
    patientName: a.patient?.fullName ?? '',
    patientCode: a.patient?.patientCode ?? '',
    patientBirthDate: iso(a.patient?.birthDate ?? null),
    doctorName: a.doctor?.fullName ?? null,
    doctorSpecialty: a.doctor?.specialty ?? null,
    lines: a.items
      .filter((i) => i.status !== 'CANCELLED')
      .map((i) => ({
        name: i.serviceName,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        discount: Number(i.discount ?? 0),
        total: Number(i.total),
      })),
    totalAmount: Number(a.totalAmount),
    discountAmount: Number(a.discountAmount),
    paidAmount: Number(a.paidAmount),
    payments: payments.map((p) => ({ method: p.method, amount: Number(p.amount) })),
    cashierName: payments.length
      ? (payments[payments.length - 1].createdBy?.fullName ?? null)
      : null,
    fiscalReceiptNo: a.fiscalStatus === 'FISCALIZED' ? (a.fiscalReceiptNo ?? null) : null,
    diagnosis: a.diagnosis ?? null,
    prescription: a.prescription ?? null,
  };
}

// ── Labels ──────────────────────────────────────────────────────────────────────────────────

const LABELS = {
  ru: {
    receipt: 'Чек №',
    date: 'Дата',
    patient: 'Пациент',
    patientCode: 'Карта',
    doctor: 'Врач',
    cashier: 'Кассир',
    positions: 'Позиций',
    subtotal: 'Подитог',
    discount: 'Скидка',
    total: 'ИТОГО',
    paid: 'Оплачено',
    remaining: 'Остаток',
    payment: 'Оплата',
    CASH: 'Наличные',
    CARD: 'Карта',
    TRANSFER: 'Перечисление',
    INSURANCE: 'Страховка',
    currency: 'сум',
    fiscal: 'Фискальный чек №',
    thankYou: 'Спасибо! Будьте здоровы!',
    testTitle: 'ТЕСТОВАЯ ПЕЧАТЬ',
    testMessage: 'Если вы видите этот текст, принтер работает.',
    printer: 'Принтер',
    prescription: 'РЕЦЕПТ',
    birthDate: 'Дата рождения',
    diagnosis: 'Диагноз',
    rx: 'Назначение',
    signature: 'Подпись врача',
  },
  uz: {
    receipt: 'Chek №',
    date: 'Sana',
    patient: 'Bemor',
    patientCode: 'Karta',
    doctor: 'Shifokor',
    cashier: 'Kassir',
    positions: 'Pozitsiyalar',
    subtotal: 'Oraliq jami',
    discount: 'Chegirma',
    total: 'JAMI',
    paid: "To'langan",
    remaining: 'Qoldiq',
    payment: "To'lov",
    CASH: 'Naqd',
    CARD: 'Karta',
    TRANSFER: "O'tkazma",
    INSURANCE: "Sug'urta",
    currency: "so'm",
    fiscal: 'Fiskal chek №',
    thankYou: "Rahmat! Sog' bo'ling!",
    testTitle: 'TEST CHOP ETISH',
    testMessage: "Bu matnni ko'rsangiz, printer ishlayapti.",
    printer: 'Printer',
    prescription: 'RETSEPT',
    birthDate: "Tug'ilgan sana",
    diagnosis: 'Tashxis',
    rx: 'Tayinlov',
    signature: 'Shifokor imzosi',
  },
};
type Labels = Record<keyof (typeof LABELS)['ru'], string>;

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const money = (n: number, l: Labels) =>
  `${Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ')} ${l.currency}`;

function dateTime(isoDate: string, lang: ReceiptLanguage): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  void lang; // the same digits in both languages: dd.mm.yyyy hh:mm
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dateOnly(isoDate: string | null): string {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function logo(layout: ReceiptLayout, at: 'top' | 'bottom'): string {
  const src = at === 'top' ? layout.logoTop : layout.logoBottom;
  if (!src || !LOGO_DATA_URL_RE.test(src)) return '';
  const raw = at === 'top' ? layout.logoTopSize : layout.logoBottomSize;
  const size = Math.min(100, Math.max(10, Math.round(raw) || 50));
  return `<div class="logo"><img src="${src}" style="width:${size}%" alt=""></div>`;
}

function clinicBlock(layout: ReceiptLayout): string {
  const rows: string[] = [];
  if (layout.showClinicName && layout.clinicName) {
    rows.push(`<div class="brand">${escapeHtml(layout.clinicName)}</div>`);
  }
  if (layout.showAddress && layout.address)
    rows.push(`<div class="sub">${escapeHtml(layout.address)}</div>`);
  if (layout.showPhone && layout.phone) {
    rows.push(`<div class="sub">${escapeHtml(formatPhone(layout.phone))}</div>`);
  }
  if (layout.showStir && layout.stir)
    rows.push(`<div class="sub">STIR: ${escapeHtml(layout.stir)}</div>`);
  if (layout.header) rows.push(`<div class="sub">${escapeHtml(layout.header)}</div>`);
  return rows.length ? `<div class="center">${rows.join('')}</div>` : '';
}

const row = (label: string, value: string, cls = '') =>
  `<div class="row ${cls}"><span>${label}</span><span class="dots"></span><span>${value}</span></div>`;

function rollStyles(widthMm: number): string {
  const sm = widthMm === 58;
  return `
    @page { size: ${widthMm}mm auto; margin: 0; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, 'Liberation Sans', sans-serif;
      font-size: ${sm ? 13 : 15}px;
      width: ${widthMm}mm;
      max-width: 100%;
      /* The 11 mm on the right offsets the thermal head's ~5 mm left margin (SavdoChef). */
      padding: 2mm 11mm 2mm 0;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
    }
    .center { text-align: center; }
    .brand { font-size: ${sm ? 17 : 20}px; font-weight: 700; margin-bottom: 2px; }
    .sub { font-size: ${sm ? 12 : 14}px; }
    .title { font-size: ${sm ? 15 : 17}px; font-weight: 700; text-align: center; margin: 2px 0; }
    hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
    hr.double { border-top: 2px solid #000; }
    .meta { display: grid; grid-template-columns: auto 1fr; gap: 1px 6px; }
    .meta .k { font-weight: 600; white-space: nowrap; }
    .meta .v { text-align: right; overflow-wrap: anywhere; }
    .item { margin: 3px 0; }
    .item-name { font-weight: 600; }
    .item-detail { display: flex; justify-content: space-between; padding-left: 10px; font-size: ${sm ? 12 : 14}px; }
    .item-meta { padding-left: 10px; font-size: ${sm ? 11 : 12}px; }
    .row { display: flex; align-items: baseline; margin: 2px 0; }
    .row .dots { flex: 1; border-bottom: 1px dotted #000; margin: 0 4px; min-width: 8px; }
    .row.grand { font-size: ${sm ? 17 : 20}px; font-weight: 700; margin: 4px 0; }
    .row.indent span:first-child { padding-left: 10px; }
    .footer { margin-top: 6px; font-size: ${sm ? 12 : 14}px; }
    .logo { text-align: center; margin: 4px 0; }
    .logo img { max-width: 100%; height: auto; display: block; margin: 0 auto; }
    .text { white-space: pre-wrap; overflow-wrap: anywhere; }
    .sign { margin-top: 18px; }
  `;
}

const page = (styles: string, body: string) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8">${CSP}<style>${styles}</style></head><body>${body}</body></html>`;

/** Nothing loads but inline styles and data-URL images (no scripts, no network). */
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">`;

/** The visit receipt on the thermal roll. */
export function buildVisitReceiptHTML(
  visit: PrintableVisit,
  layout: ReceiptLayout,
  width: PaperWidth,
): string {
  const l = LABELS[layout.language] ?? LABELS.uz;
  const widthMm = width === '58' ? 58 : 80;

  const meta = [
    `<span class="k">${l.receipt}</span><span class="v">${escapeHtml(visit.appointmentNumber)}</span>`,
    `<span class="k">${l.date}</span><span class="v">${dateTime(visit.date, layout.language)}</span>`,
  ];
  if (layout.showPatient && visit.patientName) {
    meta.push(
      `<span class="k">${l.patient}</span><span class="v">${escapeHtml(visit.patientName)}</span>`,
    );
    if (visit.patientCode) {
      meta.push(
        `<span class="k">${l.patientCode}</span><span class="v">${escapeHtml(visit.patientCode)}</span>`,
      );
    }
  }
  if (layout.showDoctor && visit.doctorName) {
    meta.push(
      `<span class="k">${l.doctor}</span><span class="v">${escapeHtml(visit.doctorName)}</span>`,
    );
  }
  if (layout.showCashier && visit.cashierName) {
    meta.push(
      `<span class="k">${l.cashier}</span><span class="v">${escapeHtml(visit.cashierName)}</span>`,
    );
  }

  const items = visit.lines
    .map(
      (line, i) => `
      <div class="item">
        <div class="item-name">${i + 1}. ${escapeHtml(line.name)}</div>
        <div class="item-detail"><span>${line.quantity} × ${money(line.unitPrice, l)}</span><span>${money(line.total, l)}</span></div>
        ${line.discount > 0 ? `<div class="item-meta">${l.discount}: -${money(line.discount, l)}</div>` : ''}
      </div>`,
    )
    .join('<hr>');

  const subtotal = visit.totalAmount + visit.discountAmount;
  const remaining = Math.max(0, visit.totalAmount - visit.paidAmount);
  const totals = [
    visit.discountAmount > 0 ? row(l.subtotal, money(subtotal, l)) : '',
    visit.discountAmount > 0 ? row(l.discount, `-${money(visit.discountAmount, l)}`) : '',
    row(l.total, money(visit.totalAmount, l), 'grand'),
  ];
  if (layout.showPayments) {
    for (const p of visit.payments) {
      const name = escapeHtml((l as Record<string, string>)[p.method] ?? p.method);
      totals.push(row(name, money(p.amount, l), 'indent'));
    }
    totals.push(row(l.paid, money(visit.paidAmount, l)));
    if (remaining > 0) totals.push(row(l.remaining, money(remaining, l)));
  }

  return page(
    rollStyles(widthMm),
    `
    ${logo(layout, 'top')}
    ${clinicBlock(layout)}
    <hr>
    <div class="meta">${meta.join('')}</div>
    <hr class="double">
    ${items}
    <hr>
    <div class="sub">${l.positions}: ${visit.lines.length}</div>
    <hr>
    ${totals.join('')}
    ${visit.fiscalReceiptNo ? `<hr><div class="sub center">${l.fiscal} ${escapeHtml(visit.fiscalReceiptNo)}</div>` : ''}
    <hr>
    <div class="center footer">${escapeHtml(layout.footer || l.thankYou)}</div>
    ${logo(layout, 'bottom')}`,
  );
}

function a4Styles(): string {
  return `
    @page { size: A4; margin: 15mm; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, 'Liberation Sans', sans-serif; font-size: 14px; color: #000; background: #fff; }
    .center { text-align: center; }
    .brand { font-size: 22px; font-weight: 700; }
    .sub { font-size: 13px; }
    .title { font-size: 20px; font-weight: 700; text-align: center; margin: 14px 0; letter-spacing: 2px; }
    hr { border: none; border-top: 1px solid #000; margin: 10px 0; }
    hr.double { border-top: 2px solid #000; }
    .meta { display: grid; grid-template-columns: 160px 1fr; gap: 4px 12px; }
    .meta .k { font-weight: 600; }
    .section { margin-top: 14px; }
    .section .k { font-weight: 700; margin-bottom: 4px; }
    .text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.5; }
    .sign { margin-top: 48px; display: flex; justify-content: space-between; }
    .footer { margin-top: 24px; font-size: 13px; }
    .logo { text-align: center; margin: 6px 0; }
    .logo img { max-width: 60mm; height: auto; }
  `;
}

/** The doctor's prescription: on the receipt roll, or A4 on a document printer. */
export function buildPrescriptionHTML(
  visit: PrintableVisit,
  layout: ReceiptLayout,
  paper: DocumentPaper,
): string {
  const l = LABELS[layout.language] ?? LABELS.uz;
  const styles = paper === 'A4' ? a4Styles() : rollStyles(paper === '58' ? 58 : 80);
  const meta = [
    `<span class="k">${l.receipt}</span><span class="v">${escapeHtml(visit.appointmentNumber)}</span>`,
    `<span class="k">${l.date}</span><span class="v">${dateTime(visit.date, layout.language)}</span>`,
    `<span class="k">${l.patient}</span><span class="v">${escapeHtml(visit.patientName)}</span>`,
  ];
  if (visit.patientCode) {
    meta.push(
      `<span class="k">${l.patientCode}</span><span class="v">${escapeHtml(visit.patientCode)}</span>`,
    );
  }
  if (visit.patientBirthDate) {
    meta.push(
      `<span class="k">${l.birthDate}</span><span class="v">${dateOnly(visit.patientBirthDate)}</span>`,
    );
  }
  if (visit.doctorName) {
    const spec = visit.doctorSpecialty ? ` (${escapeHtml(visit.doctorSpecialty)})` : '';
    meta.push(
      `<span class="k">${l.doctor}</span><span class="v">${escapeHtml(visit.doctorName)}${spec}</span>`,
    );
  }
  const section = (title: string, text: string | null) =>
    text
      ? `<div class="section"><div class="k">${title}:</div><div class="text">${escapeHtml(text)}</div></div>`
      : '';

  return page(
    styles,
    `
    ${logo(layout, 'top')}
    ${clinicBlock(layout)}
    <hr class="double">
    <div class="title">${l.prescription}</div>
    <div class="meta">${meta.join('')}</div>
    <hr>
    ${section(l.diagnosis, visit.diagnosis)}
    ${section(l.rx, visit.prescription)}
    <div class="sign"><span>${l.signature}:</span><span>______________________</span></div>
    <div class="center footer">${escapeHtml(layout.footer || l.thankYou)}</div>`,
  );
}

/** Settings → Printer → "Test print". */
export function buildTestPageHTML(
  layout: ReceiptLayout,
  paper: DocumentPaper,
  printerName: string,
  now: Date = new Date(),
): string {
  const l = LABELS[layout.language] ?? LABELS.uz;
  const styles = paper === 'A4' ? a4Styles() : rollStyles(paper === '58' ? 58 : 80);
  return page(
    styles,
    `
    ${logo(layout, 'top')}
    <div class="center">
      <hr class="double">
      <div class="title">${l.testTitle}</div>
      <hr class="double">
      <div style="margin:8px 0">${l.testMessage}</div>
      <div class="sub">${l.printer}: ${escapeHtml(printerName)}</div>
      <div class="sub">${l.date}: ${dateTime(now.toISOString(), layout.language)}</div>
      ${layout.clinicName ? `<div class="sub">${escapeHtml(layout.clinicName)}</div>` : ''}
      <hr class="double">
    </div>
    ${logo(layout, 'bottom')}`,
  );
}

/** A made-up visit for the live preview in Settings → Receipt. */
export function sampleVisit(lang: ReceiptLanguage): PrintableVisit {
  const ru = lang === 'ru';
  return {
    appointmentNumber: 'V-000123',
    date: new Date().toISOString(),
    patientName: ru ? 'Иванов Алишер' : 'Aliyev Alisher',
    patientCode: 'P-00042',
    patientBirthDate: '1990-05-12T00:00:00.000Z',
    doctorName: ru ? 'Каримова Н.' : 'Karimova N.',
    doctorSpecialty: ru ? 'Паразитолог' : 'Parazitolog',
    lines: [
      {
        name: ru ? 'Консультация паразитолога' : 'Parazitolog konsultatsiyasi',
        quantity: 1,
        unitPrice: 150000,
        discount: 0,
        total: 150000,
      },
      {
        name: ru ? 'Анализ кала на яйца глист' : 'Najasni gijja tuxumiga tahlil',
        quantity: 1,
        unitPrice: 60000,
        discount: 0,
        total: 60000,
      },
      {
        name: ru ? 'Курс процедур' : 'Muolajalar kursi',
        quantity: 5,
        unitPrice: 40000,
        discount: 20000,
        total: 180000,
      },
    ],
    totalAmount: 390000,
    discountAmount: 20000,
    paidAmount: 390000,
    payments: [
      { method: 'CASH', amount: 200000 },
      { method: 'CARD', amount: 190000 },
    ],
    cashierName: ru ? 'Петрова О.' : 'Rahimova O.',
    fiscalReceiptNo: null,
    diagnosis: null,
    prescription: null,
  };
}

/**
 * The receipt preview: the print padding (11 mm on the right, for the printer's hardware margin)
 * is evened out so it looks centred on screen.
 */
export function buildSampleReceiptHTML(layout: ReceiptLayout, width: PaperWidth): string {
  return buildVisitReceiptHTML(sampleVisit(layout.language), layout, width).replace(
    '</style>',
    ' body { padding: 2mm 3mm !important; }</style>',
  );
}
