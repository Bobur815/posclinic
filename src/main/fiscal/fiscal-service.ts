import type {
  FiscalConfigDto,
  FiscalConnectionDto,
  FiscalRetryAllDto,
  FiscalStatusDto,
  FiscalZReportDto,
} from '../../shared/clinic';
import {
  buildFiscalReceipt,
  FiscalReceiptError,
  nonFiscalMethod,
} from '../../shared/fiscal-receipt';
import { RefusedError } from '../ipc/ipc-safe';
import type { Cipher } from '../lan/config';
import {
  isAllowedVcrHost,
  parseFiscalConfig,
  type ResolvedFiscalConfig,
  receiptCode,
  receiptCodePrefix,
  resolveFiscalConfig,
  saveFiscalConfig,
  toFiscalConfigDto,
} from './config';
import {
  describeVcrError,
  ERR_Z_EMPTY,
  ERR_Z_NOT_OPEN,
  ERR_Z_NOT_OPEN_NEW,
  isEnvironmentError,
  nothingWasSent,
  VcrClient,
  VcrError,
  type VcrReceiptResult,
  type VcrZReportInfo,
  zIsOpen,
} from './vcr-client';

/**
 * v2.6: fiscal receipts through REGOS:VCR on the main till (SavdoChef's fiscal-service.ts, cut to a
 * clinic: visits instead of orders, no debts, no check edits, no refunds in v1). The failure mode
 * is "allow, fiscalise later": a payment commits whatever VCR does; a visit fully paid in cash /
 * card waits as PENDING and is sent here after commit, in the background (`kick`), at shift close,
 * on "Send again" and once after start.
 *
 * Never twice: every receipt carries `code` = PC-<database prefix>-<visit number> (VCR's
 * idempotency key). A visit sent before (an answer may have been lost) is first looked up by its
 * code and adopted when VCR holds it. All VCR calls run one at a time (`exclusive`).
 *
 * Environment trouble (VCR off, busy, offline, printer or module missing) leaves the visit PENDING
 * with the reason and costs no attempt; a refusal of the receipt's data (MXIK, VAT) makes it FAILED
 * (only "Send again" sends it again). The Z-report follows the cash shift.
 */

export interface FiscalLog {
  info(message: string): void;
  warn(message: string, error?: unknown): void;
  error(message: string, error?: unknown): void;
}

// biome-ignore lint/suspicious/noExplicitAny: the generated client
type Db = any;

export interface FiscalServiceOptions {
  getDb(): Db;
  cipher: Cipher;
  /** A development run only (POSCLINIC_VCR_URL): this URL instead of host and port. */
  urlOverride?: string | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
  busyRetryMs?: number[];
  /** Visits changed (their fiscal state): pages reload. */
  onChange(): void;
  log: FiscalLog;
}

export type SendOutcome = 'sent' | 'pending' | 'failed' | 'skipped';

const NO_PASSWORD = 'VCR paroli kiritilmagan (Sozlamalar → Fiskal chek)';
const PAID = { paymentStatus: 'PAID', status: { not: 'CANCELLED' } };

export class FiscalService {
  private chain: Promise<unknown> = Promise.resolve();
  /** VCR's Z-report is known to be open (verified where it matters: 704010 reopens it). */
  private zOpenKnown = false;
  private kicking = false;
  private kickRun: Promise<void> = Promise.resolve();
  private zRun: Promise<void> = Promise.resolve();
  private kickAgain = false;

  constructor(private readonly opts: FiscalServiceOptions) {}

  private get db(): Db {
    return this.opts.getDb();
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private config(): Promise<ResolvedFiscalConfig> {
    return resolveFiscalConfig(this.db, this.opts.cipher);
  }

  private clientFor(cfg: ResolvedFiscalConfig): VcrClient | null {
    if (!cfg.password) return null;
    // Checked again here: a stored value may not have come through the settings form.
    if (!this.opts.urlOverride && !isAllowedVcrHost(cfg.host)) {
      this.opts.log.error('[fiscal] refusing a VCR host outside this network');
      return null;
    }
    return new VcrClient({
      url: this.opts.urlOverride || `http://${cfg.host}:${cfg.port}/`,
      login: cfg.login,
      password: cfg.password,
      ...(this.opts.timeoutMs ? { timeoutMs: this.opts.timeoutMs } : {}),
      ...(this.opts.busyRetryMs ? { busyRetryMs: this.opts.busyRetryMs } : {}),
      ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}),
    });
  }

  private async requireClient(): Promise<{ cfg: ResolvedFiscalConfig; client: VcrClient }> {
    const cfg = await this.config();
    if (!cfg.enabled) throw new RefusedError('errors.fiscalOff');
    const client = this.clientFor(cfg);
    if (!client) throw new RefusedError('errors.fiscalNoPassword');
    return { cfg, client };
  }

  private changed(): void {
    try {
      this.opts.onChange();
    } catch (e) {
      this.opts.log.warn('[fiscal] change broadcast failed', e);
    }
  }

  // ── settings ─────────────────────────────────────────────────────────────────────────────

  async getConfig(): Promise<FiscalConfigDto> {
    return toFiscalConfigDto(await this.config(), Boolean(this.opts.urlOverride));
  }

  async setConfig(raw: unknown): Promise<FiscalConfigDto> {
    const input = parseFiscalConfig(raw);
    await this.db.$transaction((tx: Db) => saveFiscalConfig(tx, this.opts.cipher, input));
    // Another VCR, or the same one switched off and on: ask it again.
    this.zOpenKnown = false;
    const dto = await this.getConfig();
    if (dto.enabled) {
      await receiptCodePrefix(this.db);
      this.kick();
    }
    return dto;
  }

  async testConnection(): Promise<FiscalConnectionDto> {
    const cfg = await this.config();
    const client = this.clientFor(cfg);
    if (!client) throw new RefusedError('errors.fiscalNoPassword');
    return this.exclusive(async () => {
      try {
        const info = await client.initialize();
        const overflow = await client.overflowInfo();
        return {
          terminalId: info.TerminalID,
          appletVersion: info.AppletVersion,
          freeZReports: overflow.AvaialableZReportCount,
          freeUnsentReceipts: overflow.AvaialableUnsendReceiptCount,
        };
      } catch (e) {
        throw new RefusedError(describeVcrError(e));
      }
    });
  }

  async status(): Promise<FiscalStatusDto> {
    const cfg = await this.config();
    const [pending, failed] = await Promise.all([
      this.db.appointment.count({ where: { fiscalStatus: 'PENDING' } }),
      this.db.appointment.count({ where: { fiscalStatus: 'FAILED' } }),
    ]);
    return { enabled: cfg.enabled, pending, failed };
  }

  // ── sending ──────────────────────────────────────────────────────────────────────────────

  /** Sends every PENDING visit in the background; a kick while one runs runs once more after. */
  kick(): void {
    if (this.kicking) {
      this.kickAgain = true;
      return;
    }
    this.kicking = true;
    this.kickRun = (async () => {
      try {
        do {
          this.kickAgain = false;
          await this.sendWaiting();
        } while (this.kickAgain);
      } catch (e) {
        this.opts.log.error('[fiscal] background send failed', e);
      } finally {
        this.kicking = false;
      }
    })();
  }

  /** Resolves once the background sends started so far are done, and VCR is free (tests). */
  async settled(): Promise<void> {
    await Promise.all([this.kickRun, this.zRun]);
    await this.chain;
  }

  /**
   * Sends the waiting visits, oldest first; stops at the first one VCR cannot take for reasons of
   * its own (the next would get the same answer).
   */
  async sendWaiting(opts: { manual?: boolean } = {}): Promise<FiscalRetryAllDto> {
    const result: FiscalRetryAllDto = { sent: 0, failed: 0, pending: 0 };
    const cfg = await this.config();
    if (!cfg.enabled) return result;
    const ids: Array<{ id: string }> = await this.db.appointment.findMany({
      where: { fiscalStatus: 'PENDING', ...PAID },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: 200,
    });
    for (const { id } of ids) {
      const outcome = await this.send(id, opts);
      if (outcome === 'sent') result.sent++;
      else if (outcome === 'failed') result.failed++;
      else if (outcome === 'pending') {
        result.pending++;
        break;
      }
    }
    return result;
  }

  /** Manual: everything waiting, FAILED ones included (one more try each). */
  async retryAll(): Promise<true> {
    await this.requireClient();
    await this.db.appointment.updateMany({
      where: { fiscalStatus: 'FAILED', ...PAID },
      data: { fiscalStatus: 'PENDING' },
    });
    // In the background (kick): many receipts can take longer than a satellite's call may wait.
    // Each visit's page and the Z-report panel show how it went.
    this.changed();
    this.kick();
    return true;
  }

  /** Manual "Send again" for one visit: a FAILED one gets another try. */
  async retry(appointmentId: string): Promise<SendOutcome> {
    await this.requireClient();
    const a = await this.db.appointment.findUnique({
      where: { id: String(appointmentId ?? '') },
      select: { fiscalStatus: true },
    });
    if (a?.fiscalStatus === 'FAILED') {
      await this.db.appointment.update({
        where: { id: appointmentId },
        data: { fiscalStatus: 'PENDING' },
      });
    } else if (a?.fiscalStatus !== 'PENDING') {
      throw new RefusedError('errors.fiscalNotSendable');
    }
    return this.send(appointmentId, { manual: true });
  }

  /** One visit, queued behind every other VCR call. */
  async send(appointmentId: string, opts: { manual?: boolean } = {}): Promise<SendOutcome> {
    try {
      return await this.exclusive(() => this.sendNow(appointmentId, opts.manual ?? false));
    } finally {
      this.changed();
    }
  }

  private loadVisit(id: string) {
    return this.db.appointment.findUnique({
      where: { id },
      include: {
        items: {
          where: { status: { not: 'CANCELLED' } },
          include: { service: { select: { kind: true, mxik: true, packageCode: true } } },
          orderBy: { id: 'asc' },
        },
        payments: {
          orderBy: { createdAt: 'asc' },
          include: { createdBy: { select: { fullName: true } } },
        },
      },
    });
  }

  private async sendNow(id: string, manual: boolean): Promise<SendOutcome> {
    const cfg = await this.config();
    if (!cfg.enabled) return 'skipped';
    const visit = await this.loadVisit(id);
    if (!visit || visit.paymentStatus !== 'PAID' || visit.status === 'CANCELLED') return 'skipped';
    if (visit.fiscalStatus !== 'PENDING') return 'skipped';

    const payments = (visit.payments as Array<{ method: string; amount: unknown }>).map((p) => ({
      method: p.method,
      amount: Number(p.amount),
    }));
    const paidInRows = payments.reduce((s, p) => s + p.amount, 0);
    // Paid partly before v2.6 (no payment rows) or by transfer / insurance: never fiscalised.
    if (
      nonFiscalMethod(payments) ||
      Math.round(paidInRows * 100) !== Math.round(Number(visit.paidAmount) * 100)
    ) {
      await this.mark(
        id,
        'SKIPPED',
        nonFiscalMethod(payments)
          ? `To'lov usuli: ${nonFiscalMethod(payments)}`
          : "v2.6 dan oldingi to'lov",
      );
      return 'skipped';
    }

    const client = this.clientFor(cfg);
    if (!client) {
      await this.markPending(id, NO_PASSWORD);
      return 'pending';
    }

    let built: ReturnType<typeof buildFiscalReceipt>;
    try {
      built = buildFiscalReceipt(
        {
          lines: (
            visit.items as Array<
              Record<string, unknown> & {
                service: { kind: string; mxik: string | null; packageCode: string | null };
              }
            >
          ).map((i) => ({
            serviceId: String(i.serviceId),
            name: String(i.serviceName),
            kind: i.service.kind,
            mxik: i.service.mxik,
            packageCode: i.service.packageCode,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            discount: Number(i.discount),
            total: Number(i.total),
          })),
          payments,
        },
        cfg.codes,
      );
    } catch (e) {
      if (!(e instanceof FiscalReceiptError)) throw e;
      await this.markFailed(id, e.message);
      return 'failed';
    }
    const expected = built.positions.reduce((s, p) => s + p.amount - p.discount, 0);
    const code = receiptCode(await receiptCodePrefix(this.db), visit.appointmentNumber);

    if (visit.fiscalError !== null || visit.fiscalAttempts > 0) {
      try {
        const held = await this.lookup(client, code);
        if (held) {
          this.opts.log.info(`[fiscal] ${visit.appointmentNumber} already on VCR, not sent again`);
          return this.adopt(id, held, expected);
        }
      } catch (e) {
        await this.markPending(id, describeVcrError(e));
        return 'pending';
      }
    }

    const shiftId: string | null =
      (visit.payments as Array<{ shiftId: string }>).at(-1)?.shiftId ?? null;
    try {
      await this.ensureZOpen(client, shiftId);
      let result: VcrReceiptResult | null = null;
      for (let reopened = false; result === null; ) {
        try {
          result = await client.sale({
            positions: built.positions,
            payments: built.payments,
            code,
            cashier_name:
              (visit.payments as Array<{ createdBy: { fullName: string } | null }>).at(-1)
                ?.createdBy?.fullName ?? undefined,
            session_code: shiftId ?? undefined,
            pos_id: 'posclinic',
          });
        } catch (e) {
          const zClosed =
            e instanceof VcrError && (e.code === ERR_Z_NOT_OPEN || e.code === ERR_Z_NOT_OPEN_NEW);
          if (reopened || !zClosed) throw e;
          reopened = true;
          this.zOpenKnown = false;
          await this.ensureZOpen(client, shiftId, true);
        }
      }
      this.opts.log.info(
        `[fiscal] FISCALIZED ${visit.appointmentNumber} -> ReceiptNo ${result.ReceiptNo}`,
      );
      return this.adopt(id, result, expected);
    } catch (e) {
      this.opts.log.error(
        `[fiscal] ${visit.appointmentNumber} not fiscalised: ${describeVcrError(e)}`,
      );
      // The receipt may be registered with only the answer lost: look it up before failing it.
      if (!nothingWasSent(e)) {
        const held = await this.lookup(client, code).catch(() => null);
        if (held) return this.adopt(id, held, expected);
      }
      if (isEnvironmentError(e)) {
        await this.markPending(id, describeVcrError(e));
        return 'pending';
      }
      await this.markFailed(id, describeVcrError(e));
      return 'failed';
    }
  }

  /** The receipt VCR holds under our code; null = none. Throws when VCR could not be asked. */
  private async lookup(client: VcrClient, code: string): Promise<VcrReceiptResult | null> {
    try {
      const r = await client.receiptByCode(code);
      return r && r.FiscalSign ? r : null;
    } catch (e) {
      if (isEnvironmentError(e)) throw e;
      return null; // VCR answered: it has no receipt with this code
    }
  }

  private async adopt(
    id: string,
    r: VcrReceiptResult,
    expectedTiyin: number,
  ): Promise<SendOutcome> {
    // A receipt under our code with another amount is not this visit's (a restored database).
    if (typeof r.Amount === 'number' && r.Amount !== expectedTiyin) {
      await this.markFailed(id, `VCR da shu kod bilan boshqa summali chek bor (${r.Amount / 100})`);
      return 'failed';
    }
    const write = () =>
      this.db.appointment.updateMany({
        where: { id, ...PAID },
        data: {
          fiscalStatus: 'FISCALIZED',
          fiscalError: null,
          fiscalReceiptId: r.Id ?? null,
          fiscalReceiptNo: r.ReceiptNo ?? null,
          fiscalSign: r.FiscalSign ?? null,
          fiscalQrUrl: r.QRCodeURL ?? null,
          fiscalTerminalId: r.TerminalID ?? null,
          fiscalAt: new Date(),
        },
      });
    let written: { count: number };
    try {
      written = await write();
    } catch (first) {
      this.opts.log.warn(`[fiscal] recording receipt ${r.ReceiptNo} failed, retrying`, first);
      // If this fails too the visit stays PENDING with an attempt behind it: the next send finds
      // the receipt by its code instead of registering it again.
      written = await write();
    }
    if (written.count !== 1) {
      this.opts.log.error(
        `[fiscal] VCR registered receipt ${r.ReceiptNo} for visit ${id}, which is no longer paid: refund it in REGOS:VCR`,
      );
    }
    return 'sent';
  }

  private async mark(id: string, status: 'SKIPPED', error: string): Promise<void> {
    await this.db.appointment
      .update({ where: { id }, data: { fiscalStatus: status, fiscalError: error } })
      .catch((e: unknown) => this.opts.log.error('[fiscal] status write failed', e));
  }

  private async markPending(id: string, error: string): Promise<void> {
    await this.db.appointment
      .update({ where: { id }, data: { fiscalStatus: 'PENDING', fiscalError: error } })
      .catch((e: unknown) => this.opts.log.error('[fiscal] status write failed', e));
  }

  private async markFailed(id: string, error: string): Promise<void> {
    await this.db.appointment
      .update({
        where: { id },
        data: { fiscalStatus: 'FAILED', fiscalError: error, fiscalAttempts: { increment: 1 } },
      })
      .catch((e: unknown) => this.opts.log.error('[fiscal] status write failed', e));
  }

  /** A fiscal copy printed by VCR. */
  async duplicate(appointmentId: string): Promise<void> {
    const a = await this.db.appointment.findUnique({ where: { id: String(appointmentId ?? '') } });
    if (a?.fiscalStatus !== 'FISCALIZED' || !a.fiscalReceiptId) {
      throw new RefusedError('errors.fiscalNotFiscal');
    }
    const { client } = await this.requireClient();
    const receiptId = a.fiscalReceiptId as string;
    await this.exclusive(async () => {
      try {
        await client.duplicate(receiptId);
      } catch (e) {
        throw new RefusedError(describeVcrError(e));
      }
    });
  }

  // ── Z-report (follows the cash shift) ─────────────────────────────────────────────────────

  private async ensureZOpen(
    client: VcrClient,
    shiftId: string | null,
    force = false,
  ): Promise<void> {
    if (this.zOpenKnown && !force) return;
    const info = await client.zInfo();
    if (!zIsOpen(info)) {
      const z = await client.zOpen();
      if (shiftId) {
        await this.db.shift
          .update({ where: { id: shiftId }, data: { fiscalZReportId: z.id } })
          .catch(() => undefined);
      }
      this.opts.log.info(`[fiscal] Z-report ${z.id} opened`);
    }
    this.zOpenKnown = true;
  }

  /** After a shift opened: VCR's Z-report too, in the background. Never fails the shift. */
  afterShiftOpen(shiftId: string): void {
    this.zRun = (async () => {
      const cfg = await this.config();
      const client = cfg.enabled ? this.clientFor(cfg) : null;
      if (!client) return;
      await this.exclusive(() => this.ensureZOpen(client, shiftId, true));
    })().catch((e: unknown) =>
      this.opts.log.warn(`[fiscal] Z-report not opened with the shift: ${describeVcrError(e)}`),
    );
  }

  /**
   * After a shift closed: the waiting receipts first, then VCR's Z-report. Never throws; what went
   * wrong comes back for the close dialog (the shift is closed either way).
   */
  async afterShiftClose(shiftId: string): Promise<string | null> {
    const run = this.closeZWithShift(shiftId);
    this.zRun = run.then(() => undefined);
    return run;
  }

  private async closeZWithShift(shiftId: string): Promise<string | null> {
    const cfg = await this.config();
    if (!cfg.enabled) return null;
    const client = this.clientFor(cfg);
    if (!client) return NO_PASSWORD;
    const problems: string[] = [];
    try {
      await this.sendWaiting();
      const left = await this.status();
      if (left.pending + left.failed > 0) {
        problems.push(`${left.pending + left.failed} ta chek VCR ga yuborilmadi`);
      }
    } catch (e) {
      problems.push(describeVcrError(e));
    }
    try {
      await this.exclusive(async () => {
        this.zOpenKnown = false;
        try {
          await client.zClose();
        } catch (e) {
          if (!(e instanceof VcrError && (e.code === ERR_Z_EMPTY || e.code === ERR_Z_NOT_OPEN)))
            throw e;
        }
        await this.db.shift.update({
          where: { id: shiftId },
          data: { fiscalZClosedAt: new Date() },
        });
      });
    } catch (e) {
      this.opts.log.error(`[fiscal] Z-report not closed with the shift: ${describeVcrError(e)}`);
      problems.push(`Z-hisobot yopilmadi: ${describeVcrError(e)}`);
    }
    this.changed();
    return problems.length ? problems.join('. ') : null;
  }

  async zReport(): Promise<FiscalZReportDto | null> {
    const cfg = await this.config();
    if (!cfg.enabled) return null;
    const { client } = await this.requireClient();
    return this.exclusive(async () => {
      try {
        const info = await client.zInfo();
        this.zOpenKnown = zIsOpen(info);
        return toZDto(info);
      } catch (e) {
        throw new RefusedError(describeVcrError(e));
      }
    });
  }

  async zOpen(): Promise<FiscalZReportDto> {
    const { client } = await this.requireClient();
    const open = await this.db.shift.findFirst({ where: { status: 'OPEN' }, select: { id: true } });
    return this.exclusive(async () => {
      try {
        await this.ensureZOpen(client, open?.id ?? null, true);
        return toZDto(await client.zInfo());
      } catch (e) {
        throw new RefusedError(describeVcrError(e));
      }
    });
  }

  async zClose(): Promise<FiscalZReportDto> {
    const { client } = await this.requireClient();
    return this.exclusive(async () => {
      this.zOpenKnown = false;
      try {
        try {
          await client.zClose();
        } catch (e) {
          if (!(e instanceof VcrError && e.code === ERR_Z_EMPTY)) throw e;
        }
        return toZDto(await client.zInfo());
      } catch (e) {
        throw new RefusedError(describeVcrError(e));
      }
    });
  }

  /** After start: receipts left waiting by the last run go out, if a shift is open. */
  start(): void {
    void (async () => {
      const cfg = await this.config();
      if (!cfg.enabled) return;
      this.opts.log.info(
        `[fiscal] on: ${this.opts.urlOverride ? 'override URL' : `${cfg.host}:${cfg.port}`}, password ${cfg.password ? 'set' : 'MISSING'}`,
      );
      const open = await this.db.shift.findFirst({
        where: { status: 'OPEN' },
        select: { id: true },
      });
      if (open) this.kick();
    })().catch((e: unknown) => this.opts.log.warn('[fiscal] start failed', e));
  }
}

const som = (tiyin: number) => Math.round(tiyin || 0) / 100;

function toZDto(z: VcrZReportInfo): FiscalZReportDto {
  return {
    open: zIsOpen(z),
    terminalId: z.TerminalID ?? '',
    number: z.Number ?? 0,
    openTime: z.OpenTime ?? '',
    closeTime: z.CloseTime ?? '',
    saleCount: z.TotalSaleCount ?? 0,
    saleCash: som(z.TotalSaleCash),
    saleCard: som(z.TotalSaleCard),
    refundCount: z.TotalRefundCount ?? 0,
  };
}

/**
 * The visit's fiscal state when it has just become fully paid (in the payment transaction):
 * PENDING when fiscal receipts are on and it was paid in cash / card inside v2.6; SKIPPED when on
 * but it cannot be fiscalised; unchanged (null) when off or free.
 */
export async function fiscalStatusAtPayment(
  tx: Db,
  appointmentId: string,
): Promise<'PENDING' | 'SKIPPED' | null> {
  const row = await tx.setting.findUnique({ where: { key: 'fiscal_enabled' } });
  if (row?.value !== 'true') return null;
  const a = await tx.appointment.findUnique({
    where: { id: appointmentId },
    select: { paidAmount: true, payments: { select: { method: true, amount: true } } },
  });
  if (!a || Number(a.paidAmount) <= 0) return null;
  const rows = a.payments as Array<{ method: string; amount: unknown }>;
  const inRows = rows.reduce((s, p) => s + Number(p.amount), 0);
  const ok =
    !nonFiscalMethod(rows) && Math.round(inRows * 100) === Math.round(Number(a.paidAmount) * 100);
  const status = ok ? 'PENDING' : 'SKIPPED';
  await tx.appointment.update({ where: { id: appointmentId }, data: { fiscalStatus: status } });
  return status;
}
