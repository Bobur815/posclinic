import type { AppEvent, DataChangedEvent } from '../../shared/lan';

/**
 * The till's IPC handler registry. Electron-free on purpose: the satellite tests run the very
 * same handlers in plain node.
 *
 * `handle(channel, fn)` only records the handler. `ipc/dispatch.ts` binds every recorded channel
 * to `ipcMain` and is the one branch point: on a satellite it forwards `{channel, args}` to the
 * main till (src/main/lan); on the main till it runs `invokeHandler` with the caller's context,
 * whether the caller is one of its own windows or a satellite (lan/server.ts).
 */

/** Strips non-cloneable values (Prisma Decimal, Date → string) before crossing IPC. */
export function ipcSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/** Who is signed in at the calling window (a satellite's window: its session on the main till). */
export interface Actor {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: string;
  clinicId: string | null;
}

export interface HandlerContext {
  actor: Actor | null;
  /** Sign in / out the calling window (auth handlers). */
  setActor(actor: Actor | null): void;
  /** Recorded on new visits: this till's terminal id, or `lan:<deviceId>` for a satellite. */
  terminalId: string;
}

// biome-ignore lint/suspicious/noExplicitAny: each handler declares its own argument types
type Handler = (ctx: HandlerContext, ...args: any[]) => unknown;

const HANDLERS = new Map<string, Handler>();

/**
 * Thrown when the licence refuses a call. `message` is an i18n key (`license.refused.*`,
 * `license.feature.*`, `license.limit.*`); Electron prefixes it with "Error invoking remote
 * method ...", so the renderer extracts it with `licenseErrorKey()`.
 */
export class LicenseRefusedError extends Error {
  constructor(key: string) {
    super(`LICENSE:${key}`);
    this.name = 'LicenseRefusedError';
  }
}

/** A refusal that is not the licence's: `message` is an i18n key (`errors.*`, `lan.errors.*`). */
export class RefusedError extends Error {
  constructor(key: string) {
    super(key);
    this.name = 'RefusedError';
  }
}

/** Records a handler for `channel` (bound to ipcMain by dispatch.ts). */
export function handle<A extends unknown[], R>(
  channel: string,
  fn: (ctx: HandlerContext, ...args: A) => Promise<R> | R,
): void {
  if (HANDLERS.has(channel)) throw new Error(`Handler registered twice: ${channel}`);
  HANDLERS.set(channel, fn as Handler);
}

export function registeredChannels(): string[] {
  return [...HANDLERS.keys()];
}

export function hasHandler(channel: string): boolean {
  return HANDLERS.has(channel);
}

/** Tests only: start from an empty registry. */
export function clearHandlers(): void {
  HANDLERS.clear();
}

interface Hooks {
  /** The licence gate (license-core.ts `refusal`): an i18n key, or null to let the call through. */
  gate(channel: string, args: unknown[]): Promise<string | null>;
  /** A write happened (cloud sync nudge). */
  onWrite(channel: string): void;
  /** Tell every window of the main till, and every satellite, what changed. */
  emit(events: AppEvent[]): void;
}

// Refuses until the app wires the licence in (index.ts), so nothing slips through at start-up.
let hooks: Hooks = {
  gate: async () => 'license.refused.setup',
  onWrite: () => undefined,
  emit: () => undefined,
};

export function configureHandlers(next: Partial<Hooks>): void {
  hooks = { ...hooks, ...next };
}

/**
 * Channels the licence never gates: signing in, and the till's own machinery (licence, setup,
 * updater, LAN, config, cloud sync status, app info).
 */
const UNGATED = /^(auth|license|setup|update|lan|config|sync|app):/;
const WRITES = /^(patients|appointments|doctors|services|users):(create|update|checkout)$/;

/** Runs a handler on THIS till's database: licence gate, handler, then "what changed". */
export async function invokeHandler(
  channel: string,
  ctx: HandlerContext,
  args: unknown[],
): Promise<unknown> {
  const fn = HANDLERS.get(channel);
  if (!fn) throw new Error(`No handler for ${channel}`);
  if (!UNGATED.test(channel)) {
    const refused = await hooks.gate(channel, args);
    if (refused) throw new LicenseRefusedError(refused);
  }
  const result = await fn(ctx, ...args);
  const write = WRITES.exec(channel);
  if (write) {
    hooks.onWrite(channel);
    hooks.emit([{ type: 'data:changed', entity: write[1] as DataChangedEvent['entity'] }]);
  }
  return result;
}

// ── Roles ──────────────────────────────────────────────────────────────────────────────────

export const ADMIN_ROLES: ReadonlySet<string> = new Set(['CLINIC_ADMIN', 'SUPER_ADMIN']);

export function isAdmin(ctx: HandlerContext): boolean {
  return ADMIN_ROLES.has(ctx.actor?.role ?? '');
}

/** Clinic admins only (catalog, doctors, staff, LAN settings). */
export function requireAdmin(ctx: HandlerContext): void {
  if (!ctx.actor) throw new RefusedError('errors.notAuthenticated');
  if (!isAdmin(ctx)) throw new RefusedError('errors.forbidden');
}
