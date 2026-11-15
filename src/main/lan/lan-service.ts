import os from 'node:os';
import type { AppEvent, LanJoinInput, LanLinkDto, LanRole, LanStatusDto } from '../../shared/lan';
import { RefusedError } from '../ipc/ipc-safe';
import {
  becomeMain,
  becomeSatellite,
  type Cipher,
  ensureLineage,
  getLink,
  getLinkAddress,
  getPort,
  getRole,
  isEnabled,
  setEnabled,
  setPort,
} from './config';
import type { LanDb } from './db';
import { countActiveDevices, listDevices, revokeDevice } from './devices';
import { MainLink, PairError, pairWithMain } from './main-link';
import { PairingStore } from './pairing';
import { normaliseMainAddress, shouldServe } from './serve-policy';
import { LanServer, type LanServerDeps } from './server';

/**
 * This till's part in a multi-till clinic (port of SavdoChef lan-service.ts). A main till (every
 * till by default) serves its satellites when an admin switches it on (Settings → Satellite
 * tills); a satellite forwards everything to its main till over `MainLink`. Electron-free: the
 * app wires in the window broadcast, the keychain cipher and the restart.
 */

export interface LanServiceOptions {
  getDb(): LanDb;
  version: string;
  machineName: string;
  cipher: Cipher;
  /** What the server needs of the handler registry (ipc-safe.ts, auth-handlers.ts). */
  handlers: Pick<LanServerDeps, 'hasHandler' | 'invoke' | 'freshActor'>;
  /** Satellites the licence allows (terminals − 1); null = no limit. */
  deviceLimit(): number | null;
  /** The main till's own windows: the settings page re-reads (`lan:changed`). */
  onLanChanged(): void;
  /** A satellite: an event from its main till for its windows. */
  onMainEvent(event: AppEvent): void;
  /** Restart the app (a role change). */
  restart(): void;
  log(message: string, error?: unknown): void;
  fetch?: typeof fetch;
  /** A main till on this machine (127.x) may be joined: development and tests only. */
  allowLoopback?: boolean;
  /** Tests: listen on loopback only. */
  host?: string;
}

const PORT_IN_USE = 'lan.errors.portInUse';
const START_FAILED = 'lan.errors.startFailed';

export class LanService {
  private role: LanRole = 'main';
  private server: LanServer | null = null;
  private link: MainLink | null = null;
  private readonly pairing = new PairingStore();
  private error: string | null = null;
  /** A satellite whose credential cannot be read (another keychain): it must pair again. */
  private brokenLink: string | null | undefined;
  private policyRun: Promise<void> = Promise.resolve();
  private expiry: NodeJS.Timeout | null = null;

  constructor(private readonly o: LanServiceOptions) {}

  get isSatellite(): boolean {
    return this.role === 'satellite';
  }

  get mainLink(): MainLink | null {
    return this.link;
  }

  async init(): Promise<void> {
    const db = this.o.getDb();
    this.role = await getRole(db);
    if (this.role === 'satellite') {
      const link = await getLink(db, this.o.cipher);
      if (!link) {
        // Never a silent switch to a till of its own: it says it is unpaired and offers to leave.
        this.o.log('[lan] satellite credential unreadable; pair again', new Error('unreadable'));
        this.brokenLink = await getLinkAddress(db);
        return;
      }
      this.link = new MainLink({
        link,
        version: this.o.version,
        fetch: this.o.fetch,
        onEvent: (e) => this.o.onMainEvent(e),
        onState: () => this.o.onLanChanged(),
        log: this.o.log,
      });
      this.link.start();
      return;
    }
    await this.applyPolicy();
  }

  async stop(): Promise<void> {
    this.link?.stop();
    if (this.expiry) clearTimeout(this.expiry);
    await this.server?.stop();
    this.server = null;
  }

  /** Every event the main till broadcasts reaches its satellites. */
  push(events: AppEvent[]): void {
    this.server?.push(events);
  }

  /** Starts or stops the server to match the policy; serialised so two changes never race. */
  applyPolicy(): Promise<void> {
    this.policyRun = this.policyRun
      .then(() => this.applyPolicyNow())
      .catch((e: unknown) => this.o.log('[lan] policy failed', e));
    return this.policyRun;
  }

  private async applyPolicyNow(): Promise<void> {
    const db = this.o.getDb();
    const port = await getPort(db);
    const want = shouldServe({
      role: this.role,
      enabled: await isEnabled(db),
      activeDevices: await countActiveDevices(db),
      pairingOpen: this.pairing.isOpen(),
    });
    if (this.server && (!want || this.server.port !== port)) {
      await this.server.stop();
      this.server = null;
      this.o.log('[lan] server stopped');
    }
    if (want && !this.server) {
      const server = new LanServer({
        getDb: this.o.getDb,
        version: this.o.version,
        lineage: () => ensureLineage(this.o.getDb()),
        clinic: async () => {
          const c = await this.o
            .getDb()
            .localConfig.findUnique({ where: { id: 'config' } })
            .catch(() => null);
          return c ? { id: c.clinicId, name: c.clinicName } : null;
        },
        pairing: this.pairing,
        deviceLimit: this.o.deviceLimit,
        ...this.o.handlers,
        onPaired: () => {
          this.o.onLanChanged();
          void this.applyPolicy();
        },
        log: this.o.log,
      });
      try {
        await server.start(port, this.o.host);
        this.server = server;
        this.error = null;
        this.o.log(`[lan] serving satellites on port ${port}`);
      } catch (error) {
        const code = (error as { code?: string }).code;
        this.error = code === 'EADDRINUSE' ? PORT_IN_USE : START_FAILED;
        this.o.log('[lan] server failed to start', error);
      }
    }
    if (!want) this.error = null;
  }

  // ── main till: Settings → Satellite tills ─────────────────────────────────────────────────

  private assertMain(): void {
    if (this.role !== 'main') throw new RefusedError('lan.errors.mainOnly');
  }

  async status(): Promise<LanStatusDto> {
    this.assertMain();
    const db = this.o.getDb();
    const pairing = this.pairing.current();
    return {
      enabled: await isEnabled(db),
      port: await getPort(db),
      serving: this.server?.listening ?? false,
      error: this.error,
      addresses: localAddresses(),
      pairing: pairing
        ? { code: pairing.code, expiresAt: new Date(pairing.expiresAt).toISOString() }
        : null,
      devices: await listDevices(db),
      deviceLimit: this.o.deviceLimit(),
    };
  }

  async update(input: { enabled?: unknown; port?: unknown }): Promise<LanStatusDto> {
    this.assertMain();
    const db = this.o.getDb();
    if (input.port !== undefined) {
      const port = Number(input.port);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        throw new RefusedError('lan.errors.badPort');
      }
      await setPort(db, port);
    }
    if (input.enabled !== undefined) {
      await setEnabled(db, input.enabled === true);
      if (input.enabled !== true) this.pairing.cancel();
    }
    await this.applyPolicy();
    return this.status();
  }

  async issueCode(): Promise<LanStatusDto> {
    this.assertMain();
    const db = this.o.getDb();
    if (!(await isEnabled(db))) throw new RefusedError('lan.errors.notEnabled');
    const limit = this.o.deviceLimit();
    if (limit !== null && (await countActiveDevices(db)) >= limit) {
      throw new RefusedError('lan.errors.deviceLimit');
    }
    await ensureLineage(db);
    const code = this.pairing.issue();
    // The door closes again with the code when no satellite is paired yet.
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = setTimeout(
      () => void this.applyPolicy().then(() => this.o.onLanChanged()),
      code.expiresAt - Date.now() + 500,
    );
    this.expiry.unref();
    await this.applyPolicy();
    return this.status();
  }

  async cancelCode(): Promise<LanStatusDto> {
    this.assertMain();
    this.pairing.cancel();
    await this.applyPolicy();
    return this.status();
  }

  async revoke(deviceId: unknown): Promise<LanStatusDto> {
    this.assertMain();
    if (typeof deviceId !== 'string' || !(await revokeDevice(this.o.getDb(), deviceId))) {
      throw new RefusedError('lan.errors.noDevice');
    }
    this.server?.dropDevice(deviceId);
    this.o.log(`[lan] device ${deviceId} revoked`);
    await this.applyPolicy();
    return this.status();
  }

  // ── both: the role and the line ───────────────────────────────────────────────────────────

  linkStatus(): LanLinkDto {
    if (this.link) return this.link.status();
    if (this.brokenLink !== undefined) {
      return {
        role: 'satellite',
        mainUrl: this.brokenLink,
        state: 'unpaired',
        mainVersion: null,
        clinicName: null,
        lastContactAt: null,
      };
    }
    return {
      role: 'main',
      mainUrl: null,
      state: null,
      mainVersion: null,
      clinicName: null,
      lastContactAt: null,
    };
  }

  /** Leaving without a sign-in: only when the main till itself refuses this satellite. */
  get mayLeaveUnattended(): boolean {
    const s = this.linkStatus().state;
    return s === 'unpaired' || s === 'version' || s === 'superseded';
  }

  /** The clinic this satellite works for (from pairing). */
  async linkedClinic(): Promise<{ clinicId: string; clinicName: string } | null> {
    if (!this.isSatellite) return null;
    const link = await getLink(this.o.getDb(), this.o.cipher);
    return link?.clinicId ? { clinicId: link.clinicId, clinicName: link.clinicName ?? '' } : null;
  }

  /** Pairs with the main till at the address and becomes its satellite; the app restarts. */
  async join(input: LanJoinInput): Promise<LanLinkDto> {
    if (this.isSatellite) throw new RefusedError('lan.errors.alreadySatellite');
    const db = this.o.getDb();
    const mainUrl = normaliseMainAddress(
      String(input?.mainAddress ?? ''),
      await getPort(db),
      this.o.allowLoopback ?? false,
    );
    if (!mainUrl) throw new RefusedError('lan.errors.badAddress');
    const code = String(input?.code ?? '').trim();
    if (!/^\d{6}$/.test(code)) throw new RefusedError('lan.errors.codeWrong');
    let link: Awaited<ReturnType<typeof pairWithMain>>;
    try {
      link = await pairWithMain(mainUrl, code, this.o.machineName, this.o.fetch);
    } catch (error) {
      if (error instanceof PairError) throw new RefusedError(error.message);
      throw error;
    }
    if (this.server) await this.server.stop();
    this.server = null;
    await becomeSatellite(db, link, this.o.cipher);
    this.o.log(`[lan] paired as satellite ${link.deviceId} of ${mainUrl}`);
    this.o.restart();
    return {
      role: 'satellite',
      mainUrl,
      state: 'connecting',
      mainVersion: link.mainVersion,
      clinicName: link.clinicName,
      lastContactAt: null,
    };
  }

  /** A satellite becomes a till of its own again (it goes through setup); restarts. */
  async leave(): Promise<LanLinkDto> {
    if (!this.isSatellite) throw new RefusedError('lan.errors.notSatellite');
    this.link?.stop();
    await becomeMain(this.o.getDb());
    this.o.log('[lan] left the main till');
    this.o.restart();
    return this.linkStatusAfterLeave();
  }

  private linkStatusAfterLeave(): LanLinkDto {
    return {
      role: 'main',
      mainUrl: null,
      state: null,
      mainVersion: null,
      clinicName: null,
      lastContactAt: null,
    };
  }
}

/** This computer's IPv4 addresses on the clinic's network (shown for the satellite's form). */
export function localAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
        out.push(a.address);
    }
  }
  return out;
}
