import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AppEvent } from '../../shared/lan';
import type { Actor, HandlerContext } from '../ipc/ipc-safe';
import type { LanDb } from './db';
import { authenticateDevice, createDevice, DeviceLimitError } from './devices';
import type { PairingStore } from './pairing';
import { isLocalAddress } from './serve-policy';

/**
 * The main till's server for its satellites (port of SavdoChef lan/server.ts: plain node:http,
 * no framework). A satellite's renderer is unchanged: its main process forwards every IPC call
 * here, and this runs the very same handler (`invokeHandler`) with the satellite's signed-in user
 * as the actor. So roles, validation, the licence gate and every database rule are the main's.
 *
 * Routes (all refused for callers outside the clinic's network):
 *   GET  /health  no auth: { app, version } (enough for the join form to know what answers)
 *   POST /pair    no auth, the pairing code (throttled): { deviceId, secret, lineage, version, clinic }
 *   GET  /hello   device: { lineage, version } (the satellite checks it is still its main)
 *   POST /rpc     device: { channel, args } → { result, session? }
 *   GET  /events  device: Server-Sent Events, every AppEvent the main till broadcasts
 *
 * Credentials: `Authorization: Posclinic <deviceId>.<secret>` names the till (a device secret from
 * pairing, kept hashed); `X-Session` names who is signed in at that window (an in-memory token
 * made when a login over RPC succeeds, bound to that device, dropped on logout, revoke or restart).
 */

export const APP_ID = 'posclinic';
const AUTH_SCHEME = 'Posclinic ';

/**
 * Channels that belong to the machine they run on: a satellite runs them itself (dispatch.ts) and
 * the main till refuses them over the LAN. `license:status` is the exception: a satellite shows
 * (and hides plan-gated controls by) its main till's licence, which is the one that gates.
 */
const LOCAL_ONLY = /^(license|setup|update|lan|config|sync|app|print):/;
export function runsOverLan(channel: string): boolean {
  return channel === 'license:status' || !LOCAL_ONLY.test(channel);
}

/** What a call over the LAN answers; `error` is the handler's error message (an i18n key). */
export type RpcResult = { ok: true; data: unknown } | { ok: false; error: string };

const MAX_RPC_BODY = 1024 * 1024;
const MAX_PAIR_BODY = 4 * 1024;
const SSE_PING_MS = 20_000;
const MAX_STREAMS_PER_DEVICE = 2;
const MAX_STREAM_BACKLOG = 1024 * 1024;
const MAX_CONNECTIONS = 64;

/** Wrong passwords from one satellite before it waits (bcrypt is slow, but 6 chars is short). */
const DEVICE_LOGIN_FAILURES = 5;
const DEVICE_LOGIN_LOCK_MS = 5 * 60 * 1000;

export interface LanServerDeps {
  getDb(): LanDb;
  version: string;
  lineage(): Promise<string>;
  /** The clinic this main till is linked to (shown on its satellites). */
  clinic(): Promise<{ id: string; name: string } | null>;
  pairing: PairingStore;
  /** Satellites the licence allows; null = no limit. */
  deviceLimit(): number | null;
  /** Whether a handler exists for the channel. */
  hasHandler(channel: string): boolean;
  /** ipc-safe.ts `invokeHandler`: licence gate, handler, events. */
  invoke(channel: string, ctx: HandlerContext, args: unknown[]): Promise<unknown>;
  /** The session's user as the database has them now (auth-handlers.ts `freshActor`). */
  freshActor(actor: Actor): Promise<Actor | null>;
  /** A satellite paired: the settings page re-reads, the serve policy is checked again. */
  onPaired(): void;
  log(message: string, error?: unknown): void;
}

interface Session {
  deviceId: string;
  actor: Actor;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class LanServer {
  private server: Server | null = null;
  private readonly sessions = new Map<string, Session>();
  private readonly streams = new Map<ServerResponse, string>();
  private ping: NodeJS.Timeout | null = null;
  /** Logins over the LAN go one after the other, so parallel guesses cannot pass the lock. */
  private authQueue: Promise<unknown> = Promise.resolve();
  private readonly loginFailures = new Map<string, { count: number; until: number }>();

  constructor(private readonly deps: LanServerDeps) {}

  get listening(): boolean {
    return this.server?.listening ?? false;
  }

  get port(): number | null {
    const a = this.server?.address();
    return a && typeof a === 'object' ? a.port : null;
  }

  async start(port: number, host = '0.0.0.0'): Promise<void> {
    if (this.server) return;
    const server = createServer((req, res) => void this.handle(req, res));
    // Slow or idle sockets do not hold the till: requests finish in seconds, events ping.
    server.requestTimeout = 60_000;
    server.headersTimeout = 15_000;
    server.maxConnections = MAX_CONNECTIONS;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.server = server;
    this.ping = setInterval(() => this.write(': ping\n\n'), SSE_PING_MS);
    this.ping.unref();
  }

  async stop(): Promise<void> {
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    for (const res of this.streams.keys()) res.end();
    this.streams.clear();
    this.sessions.clear();
    const server = this.server;
    this.server = null;
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  /** Every AppEvent the main till broadcasts reaches its satellites too. */
  push(events: AppEvent[]): void {
    if (events.length === 0) return;
    this.write(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''));
  }

  private write(data: string): void {
    for (const res of this.streams.keys()) {
      if (res.writableLength > MAX_STREAM_BACKLOG) res.end();
      else res.write(data);
    }
  }

  /** A revoked satellite loses its sessions and its event stream at once. */
  dropDevice(deviceId: string): void {
    for (const [token, s] of this.sessions)
      if (s.deviceId === deviceId) this.sessions.delete(token);
    for (const [res, id] of this.streams) if (id === deviceId) res.end();
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const ip = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    if (!isLocalAddress(ip)) {
      req.socket.destroy();
      return;
    }
    try {
      const url = new URL(req.url ?? '/', 'http://lan');
      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, { app: APP_ID, version: this.deps.version });
      }
      if (req.method === 'POST' && url.pathname === '/pair') return await this.pair(req, res, ip);

      const device = await authenticateDevice(this.deps.getDb(), credentialOf(req), ip);
      if (!device) throw new HttpError(401, 'lan.errors.unpaired');

      if (req.method === 'GET' && url.pathname === '/hello') {
        return json(res, 200, { lineage: await this.deps.lineage(), version: this.deps.version });
      }
      if (req.method === 'POST' && url.pathname === '/rpc')
        return await this.rpc(req, res, device.id);
      if (req.method === 'GET' && url.pathname === '/events') return this.events(res, device.id);
      throw new HttpError(404, 'Not found');
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof HttpError) return json(res, error.status, { error: error.message });
      this.deps.log('[lan] request failed', error);
      return json(res, 500, { error: 'lan.errors.internal' });
    }
  }

  private async pair(req: IncomingMessage, res: ServerResponse, ip: string): Promise<void> {
    const body = (await readJson(req, MAX_PAIR_BODY)) as { code?: unknown; name?: unknown };
    const code = typeof body.code === 'string' ? body.code : '';
    const outcome = this.deps.pairing.redeem(code, ip);
    if (outcome === 'throttled') throw new HttpError(429, 'lan.errors.throttled');
    if (outcome === 'closed') throw new HttpError(403, 'lan.errors.codeClosed');
    if (outcome === 'wrong') throw new HttpError(403, 'lan.errors.codeWrong');
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    let device: { id: string; secret: string };
    try {
      device = await createDevice(this.deps.getDb(), name, ip, this.deps.deviceLimit());
    } catch (error) {
      if (error instanceof DeviceLimitError) throw new HttpError(409, error.message);
      throw error;
    }
    this.deps.log(`[lan] paired device ${device.id} from ${ip}`);
    this.deps.onPaired();
    const clinic = await this.deps.clinic();
    return json(res, 200, {
      deviceId: device.id,
      secret: device.secret,
      lineage: await this.deps.lineage(),
      version: this.deps.version,
      clinicId: clinic?.id ?? null,
      clinicName: clinic?.name ?? null,
    });
  }

  private async rpc(req: IncomingMessage, res: ServerResponse, deviceId: string): Promise<void> {
    const body = (await readJson(req, MAX_RPC_BODY)) as { channel?: unknown; args?: unknown };
    const channel = body.channel;
    if (typeof channel !== 'string' || !this.deps.hasHandler(channel)) {
      throw new HttpError(400, 'Unknown channel');
    }
    const args = Array.isArray(body.args) ? (body.args as unknown[]) : [];
    if (!runsOverLan(channel)) {
      return json(res, 200, { result: { ok: false, error: 'lan.errors.mainOnly' } });
    }

    const token = req.headers['x-session'];
    const presented = typeof token === 'string' ? token : null;
    const found = presented ? this.sessions.get(presented) : undefined;
    // A session from another till is no session (and this call must not touch it).
    const session = found && found.deviceId === deviceId ? found : undefined;
    let actor: Actor | null = session ? await this.deps.freshActor(session.actor) : null;
    let changed = false;
    if (session && !actor) {
      // Deactivated since: the session ends now.
      this.sessions.delete(presented!);
      changed = true;
    } else if (session && actor) {
      session.actor = actor;
    }

    const ctx: HandlerContext = {
      actor,
      setActor: (a) => {
        actor = a;
        changed = true;
      },
      terminalId: `lan:${deviceId}`,
    };
    const run = async (): Promise<RpcResult> => {
      // Over the LAN only signing in works without a signed-in user: the device credential names
      // a till, not a person.
      if (!ctx.actor && !channel.startsWith('auth:')) {
        return { ok: false, error: 'errors.notAuthenticated' };
      }
      try {
        return { ok: true, data: await this.deps.invoke(channel, ctx, args) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: message.slice(0, 500) };
      }
    };
    const result = channel === 'auth:login' ? await this.signIn(deviceId, run) : await run();

    let sessionOut: string | null | undefined;
    if (changed) {
      if (presented && session) this.sessions.delete(presented);
      if (actor) {
        sessionOut = randomBytes(32).toString('hex');
        this.sessions.set(sessionOut, { deviceId, actor });
      } else {
        sessionOut = null;
      }
    } else if (presented && !session) {
      // A token from another till, or one the main till forgot (it restarted, or revoked it).
      sessionOut = null;
    }
    return json(res, 200, sessionOut === undefined ? { result } : { result, session: sessionOut });
  }

  /**
   * One login at a time for the whole server, and a lock per satellite after a few wrong
   * passwords, so a satellite cannot guess passwords at the speed of the network.
   */
  private signIn(deviceId: string, run: () => Promise<RpcResult>): Promise<RpcResult> {
    const next = this.authQueue.then(async (): Promise<RpcResult> => {
      const now = Date.now();
      const f = this.loginFailures.get(deviceId) ?? { count: 0, until: 0 };
      if (f.until > now) return { ok: true, data: { success: false, error: 'too_many_attempts' } };
      const result = await run();
      const failed = result.ok && (result.data as { success?: boolean } | null)?.success === false;
      if (!failed) {
        if (result.ok) this.loginFailures.delete(deviceId);
      } else {
        const count = f.count + 1;
        this.loginFailures.set(
          deviceId,
          count >= DEVICE_LOGIN_FAILURES
            ? { count: 0, until: now + DEVICE_LOGIN_LOCK_MS }
            : { count, until: 0 },
        );
      }
      return result;
    });
    this.authQueue = next.catch(() => undefined);
    return next;
  }

  private events(res: ServerResponse, deviceId: string): void {
    // A satellite has one stream; a restart may briefly make a second. Older ones beyond that go.
    const mine = [...this.streams].filter(([, id]) => id === deviceId).map(([r]) => r);
    for (const old of mine.slice(0, Math.max(0, mine.length - MAX_STREAMS_PER_DEVICE + 1)))
      old.end();
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    this.streams.set(res, deviceId);
    res.on('close', () => this.streams.delete(res));
  }
}

function credentialOf(req: IncomingMessage): string {
  const h = req.headers.authorization ?? '';
  return h.startsWith(AUTH_SCHEME) ? h.slice(AUTH_SCHEME.length).trim() : '';
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store',
  });
  res.end(data);
}

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > limit) throw new HttpError(413, 'Too large');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Too large');
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'Bad JSON');
  }
}
