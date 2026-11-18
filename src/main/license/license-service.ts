import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, safeStorage } from 'electron';
import { z } from 'zod';
import type { ActivateResult, LicenseStatusDto } from '../../shared/license';
import { normalizePhone } from '../../shared/phone';
import { log } from '../logger';
import {
  type GateFacts,
  type LicensePayload,
  normalizeApiUrl,
  publicKeyFrom,
  type Refusal,
  readLicense,
  refusal,
  type TillState,
  tillState,
} from './license-core';
import { LICENSE_PUBLIC_KEY } from './license-public-key';
import { type MarkStore, TrustedClock } from './trusted-clock';

/**
 * This till's licence from posgro (`/api/posclinic/*`, contract `.claude/rules/licensing.md`).
 * Main only: the renderer asks through `license:*` channels and never sees the token.
 *
 * The till works offline. It reaches the server to link a clinic (setup wizard), and to check in:
 * 20 s after start, every 6 h while running, and on "check now". It must check in at least once
 * before the licence's `checkinBy`, or it goes read-only until it does.
 *
 * A licence is accepted only with the compiled-in key's signature, only for the linked clinic,
 * and only if it is not older than the one held, so a replayed old licence cannot wind the
 * trusted clock back or restore an expired plan.
 */

export const DEFAULT_API_URL = 'https://api.posgro.uz/api';
const REQUEST_TIMEOUT_MS = 15_000;
const BACKGROUND_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_BACKGROUND_DELAY_MS = 20_000;
const CHECK_MIN_INTERVAL_MS = 30_000;
const STATE_FILE = 'license-state.json';
const CLOCK_FILE = 'license-clock.bin';

/**
 * The default server: production, or in a dev build `POSCLINIC_API_URL` (staging or localhost).
 * The setup wizard may name another posgro server (`normalizeApiUrl`); the till then keeps
 * checking in there (`LicenseState.apiUrl`).
 */
export function licenseApiUrl(): string {
  const override = process.env.POSCLINIC_API_URL?.trim();
  if (!app.isPackaged && override && /^(https:\/\/|http:\/\/localhost[:/])/.test(override)) {
    return override.replace(/\/+$/, '');
  }
  return DEFAULT_API_URL;
}

// ── Persisted state ────────────────────────────────────────────────────────────────────────

const stateSchema = z.object({
  terminalId: z.string().min(1).max(64),
  storeId: z.string().max(64).nullable().default(null),
  storeName: z.string().max(200).nullable().default(null),
  token: z.string().max(8192).nullable().default(null),
  lastCheckinAt: z.string().nullable().default(null),
  lastError: z.string().max(100).nullable().default(null),
  clockMark: z.number().nullable().default(null),
  /** Server named in the setup wizard (e.g. staging); null = `licenseApiUrl()`. */
  apiUrl: z.string().max(200).nullable().default(null),
});
type LicenseState = z.infer<typeof stateSchema>;

const grantSchema = z.object({
  storeId: z.string().min(1).max(64),
  storeName: z.string().max(200),
  ownerName: z.string().max(200).nullable().optional(),
  license: z.string().min(1).max(8192),
});

class StateFile {
  constructor(private readonly file: string) {}

  read(): LicenseState | null {
    try {
      const parsed = stateSchema.safeParse(JSON.parse(fs.readFileSync(this.file, 'utf8')));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  write(state: LicenseState): void {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, this.file);
  }
}

/** Second copy of the clock mark, encrypted where the OS offers it. Never throws. */
class EncryptedMark implements MarkStore {
  constructor(private readonly file: string) {}

  async read(): Promise<number | null> {
    try {
      const raw = fs.readFileSync(this.file);
      const text = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString('utf8');
      const n = Number(text);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }

  async write(ms: number): Promise<void> {
    try {
      const text = String(ms);
      const data = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(text)
        : Buffer.from(text, 'utf8');
      fs.writeFileSync(this.file, data);
    } catch {
      /* the other copy still holds it */
    }
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly key: string,
  ) {
    super(key);
  }
}

/** posgro answers `message: "posclinic.errors.<code>"`; the till's own key is `license.errors.<code>`. */
function errorKey(e: unknown): string {
  if (e instanceof HttpError) {
    const code = /^posclinic\.errors\.([a-z_]+)$/.exec(e.key)?.[1];
    return code ? `license.errors.${code}` : 'license.errors.unknown';
  }
  if (e instanceof Error && e.message.startsWith('license.errors.')) return e.message;
  return 'license.errors.offline';
}

/** For the log: the key plus, for an HTTP answer, its status (a 404 from a server without the module). */
function failure(e: unknown): string {
  return e instanceof HttpError ? `${errorKey(e)} (HTTP ${e.status})` : errorKey(e);
}

// ── Service ────────────────────────────────────────────────────────────────────────────────

export class LicenseService {
  private readonly key = publicKeyFrom(LICENSE_PUBLIC_KEY);
  private readonly stateFile: StateFile;
  private readonly clock: TrustedClock;
  private state!: LicenseState;
  private payload: LicensePayload | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCheckStartedAt = 0;
  private facts: GateFacts | null = null;

  constructor(private readonly dir = app.getPath('userData')) {
    this.stateFile = new StateFile(path.join(dir, STATE_FILE));
    const stateMark: MarkStore = {
      read: async () => this.stateFile.read()?.clockMark ?? null,
      write: async (ms) => {
        // Before init() there is no state to add the mark to; writing would drop terminalId.
        if (!this.state) return;
        this.state = { ...this.state, clockMark: ms };
        this.save();
      },
    };
    this.clock = new TrustedClock([stateMark, new EncryptedMark(path.join(dir, CLOCK_FILE))]);
  }

  async init(): Promise<void> {
    this.state = this.stateFile.read() ?? stateSchema.parse({ terminalId: randomUUID() });
    this.save();
    await this.clock.init();
    this.clock.start();
    this.payload = readLicense(this.state.token, this.key);
    if (this.state.token && !this.payload) log.warn('[license] stored licence failed verification');
  }

  /** Database answers the gate needs; set once the clinic DB is open. */
  setFacts(facts: GateFacts): void {
    this.facts = facts;
  }

  startBackground(): void {
    if (this.timer) return;
    setTimeout(() => void this.renew(), FIRST_BACKGROUND_DELAY_MS).unref?.();
    this.timer = setInterval(() => void this.renew(), BACKGROUND_EVERY_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.clock.stop();
    void this.clock.persist();
  }

  /** The licence server this till talks to. */
  apiUrl(): string {
    return this.state.apiUrl ?? licenseApiUrl();
  }

  isLinked(): boolean {
    return this.payload !== null;
  }

  linkedStoreId(): string | null {
    return this.payload?.storeId ?? null;
  }

  /**
   * Tills the licence allows (the main one plus its satellites); null = unlimited (omitted in
   * the licence). Without a licence: 1, so no satellite pairs.
   */
  terminalLimit(): number | null {
    if (!this.payload) return 1;
    const t = this.payload.terminals;
    return typeof t === 'number' && Number.isFinite(t) ? t : null;
  }

  /**
   * What the till shows the posclinic server (cloud sync): the signed licence itself is the
   * credential, verified there with the same public key. Null until a valid licence is held.
   */
  syncCredential(): { token: string; terminalId: string } | null {
    if (!this.payload || !this.state.token) return null;
    return { token: this.state.token, terminalId: this.state.terminalId };
  }

  tillState(): TillState {
    return tillState({
      license: this.payload,
      terminalId: this.state.terminalId,
      now: this.clock.now(),
    });
  }

  async refusal(channel: string, args: unknown[]): Promise<Refusal | null> {
    const facts: GateFacts = this.facts ?? {
      activeDoctors: async () => 0,
      activeUsers: async () => 0,
      visitsThisMonth: async () => 0,
      appointmentBalance: async () => null,
    };
    return refusal(channel, args, this.tillState(), facts);
  }

  status(): LicenseStatusDto {
    const s = this.tillState();
    const p = this.payload;
    return {
      mode: s.mode,
      reason: s.reason,
      linked: p !== null,
      storeId: p?.storeId ?? null,
      storeName: p?.storeName ?? this.state.storeName,
      plan: s.plan,
      features: s.features,
      limits: s.limits,
      daysLeft: s.daysLeft,
      expiresAt: p?.expiresAt ?? null,
      trialEndsAt: p?.trialEndsAt ?? null,
      lastCheckinAt: this.state.lastCheckinAt,
      checkinBy: p?.checkinBy ?? null,
      terminalId: this.state.terminalId,
      lastError: this.state.lastError,
    };
  }

  /**
   * Setup wizard: link this till to a clinic the posgro super admin created. `onlyStoreId`
   * (recovering a set-up till whose licence file was lost) refuses a grant for any other
   * clinic before it is stored, so a working till can never be re-pointed at another clinic.
   * `rawApiUrl` (blank = the current server) names the posgro server, e.g. staging; it is kept
   * for check-ins once the link succeeds.
   */
  async activate(
    rawPhone: string,
    rawCode: string,
    onlyStoreId?: string,
    rawApiUrl?: string,
  ): Promise<ActivateResult> {
    const phone = normalizePhone(rawPhone);
    if (!phone) return { ok: false, error: 'license.errors.invalid_phone' };
    const activationCode = rawCode.replace(/[\s-]/g, '').toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(activationCode)) {
      return { ok: false, error: 'license.errors.invalid_code' };
    }
    let base = this.apiUrl();
    if (rawApiUrl?.trim()) {
      const typed = normalizeApiUrl(rawApiUrl, !app.isPackaged);
      if (!typed) return { ok: false, error: 'license.errors.invalid_api_url' };
      base = typed;
    }
    try {
      const grant = await this.post(base, '/posclinic/activate', {
        phone,
        activationCode,
        terminal: this.terminalInfo(),
      });
      if (onlyStoreId && grant?.storeId !== onlyStoreId) {
        throw new Error('license.errors.other_clinic');
      }
      await this.accept(grant, { allowRelink: true });
      this.state = { ...this.state, apiUrl: base === DEFAULT_API_URL ? null : base };
      this.save();
      log.info(`[license] linked to store ${grant.storeId} via ${base}`);
      return {
        ok: true,
        storeId: grant.storeId,
        storeName: grant.storeName,
        ownerName: grant.ownerName ?? null,
      };
    } catch (e) {
      log.warn(`[license] activate failed via ${base}: ${failure(e)}`);
      return { ok: false, error: errorKey(e) };
    }
  }

  /** Check-in. Never throws; a failure only records `lastError`. */
  async renew(): Promise<LicenseStatusDto> {
    if (!this.state.token || !this.payload) return this.status();
    const now = Date.now();
    if (now - this.lastCheckStartedAt < CHECK_MIN_INTERVAL_MS) return this.status();
    this.lastCheckStartedAt = now;
    try {
      const grant = await this.post(this.apiUrl(), '/posclinic/licenses/renew', {
        license: this.state.token,
        terminal: this.terminalInfo(),
      });
      await this.accept(grant, { allowRelink: false });
    } catch (e) {
      this.state = { ...this.state, lastError: errorKey(e) };
      this.save();
      log.warn(`[license] check-in failed via ${this.apiUrl()}: ${failure(e)}`);
      this.broadcast();
    }
    return this.status();
  }

  // ── internals ──

  private async accept(raw: unknown, opts: { allowRelink: boolean }): Promise<void> {
    const parsed = grantSchema.safeParse(raw);
    if (!parsed.success) throw new Error('license.errors.bad_answer');
    const grant = parsed.data;
    const payload = readLicense(grant.license, this.key);
    if (!payload || payload.storeId !== grant.storeId)
      throw new Error('license.errors.bad_license');
    if (!opts.allowRelink && this.payload && this.payload.storeId !== payload.storeId) {
      throw new Error('license.errors.bad_license');
    }
    if (
      this.payload &&
      this.payload.storeId === payload.storeId &&
      Date.parse(payload.issuedAt) < Date.parse(this.payload.issuedAt)
    ) {
      throw new Error('license.errors.stale_license');
    }
    this.payload = payload;
    this.state = {
      ...this.state,
      storeId: payload.storeId,
      storeName: payload.storeName,
      token: grant.license,
      lastCheckinAt: new Date().toISOString(),
      lastError: null,
    };
    this.save();
    await this.clock.correctTo(Date.parse(payload.issuedAt));
    this.broadcast();
  }

  private async post(
    base: string,
    route: string,
    body: unknown,
  ): Promise<z.infer<typeof grantSchema>> {
    const res = await fetch(`${base}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      const msg = json?.message;
      throw new HttpError(res.status, typeof msg === 'string' ? msg : '');
    }
    return json as z.infer<typeof grantSchema>;
  }

  private terminalInfo() {
    return {
      id: this.state.terminalId,
      appVersion: app.getVersion(),
      machineName: os.hostname().slice(0, 64),
    };
  }

  private save(): void {
    try {
      this.stateFile.write(this.state);
    } catch (e) {
      log.error('[license] could not save state', e);
    }
  }

  private broadcast(): void {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('license:changed');
    }
  }
}

let instance: LicenseService | null = null;

export function getLicenseService(): LicenseService {
  if (!instance) instance = new LicenseService();
  return instance;
}
