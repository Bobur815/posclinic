import { BrowserWindow, ipcMain, type WebContents } from 'electron';
import type { LicenseStatusDto } from '../../shared/license';
import type { AppEvent } from '../../shared/lan';
import { getAppConfig } from '../config/app-config';
import type { LanService } from '../lan/lan-service';
import { runsOverLan } from '../lan/server';
import { log } from '../logger';
import { freshActor } from './auth-handlers';
import {
  type Actor,
  type HandlerContext,
  invokeHandler,
  LicenseRefusedError,
  RefusedError,
  registeredChannels,
} from './ipc-safe';
import { PRINTERS } from './print-handlers';

/**
 * Binds every handler recorded with `handle()` to ipcMain, and decides where each call runs:
 * - main till: here, with the calling window's signed-in user as the actor;
 * - satellite: forwarded to the main till (lan/main-link.ts), except what belongs to this
 *   machine (`runsOverLan` false: licence linking, setup, updater, LAN, config, sync, app info)
 *   and printing, which uses this machine's printer with the visit fetched from the main till.
 */

/** Main till: who is signed in at each of its windows. */
const actors = new Map<number, Actor>();
/** Satellite: each window's session token on the main till. */
const sessions = new Map<number, string>();
const tracked = new WeakSet<WebContents>();
let lan: LanService | null = null;

/** Run on a satellite, but with the user its main till reports for the window. */
const NEEDS_REMOTE_ACTOR: ReadonlySet<string> = new Set([
  'update:download',
  'update:install',
  'lan:leave',
]);

/** Belong to a main till: a satellite refuses them outright. */
const REFUSED_ON_SATELLITE = /^(license:activate|setup:createAdmin|sync:now)$/;

function track(sender: WebContents): void {
  if (tracked.has(sender)) return;
  tracked.add(sender);
  sender.once('destroyed', () => {
    actors.delete(sender.id);
    sessions.delete(sender.id);
  });
}

/** Sends `channel` to every window of this till. */
export function sendToWindows(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
    win.webContents.send(channel, payload);
  }
}

/** Main till: what changed reaches its own windows and every satellite. */
export function broadcast(events: AppEvent[]): void {
  for (const e of events) sendToWindows(e.type, e);
  lan?.push(events);
}

export function bindIpc(lanService: LanService): void {
  lan = lanService;
  for (const channel of registeredChannels()) {
    ipcMain.handle(channel, (event, ...args: unknown[]) => dispatch(channel, event.sender, args));
  }
}

async function dispatch(channel: string, sender: WebContents, args: unknown[]): Promise<unknown> {
  track(sender);
  if (lan?.isSatellite) return satelliteCall(channel, sender, args);
  try {
    return await invokeHandler(channel, await localContext(sender), args);
  } catch (error) {
    // One place explains every licence refusal (LicenseBanner toasts it).
    if (error instanceof LicenseRefusedError) {
      sender.send('license:refused', error.message.slice('LICENSE:'.length));
    }
    throw error;
  }
}

async function localContext(sender: WebContents): Promise<HandlerContext> {
  const known = actors.get(sender.id) ?? null;
  let actor: Actor | null = null;
  try {
    actor = await freshActor(known);
  } catch {
    actor = null; // database closing (update install)
  }
  if (known && !actor) actors.delete(sender.id);
  return {
    actor,
    setActor: (a) => {
      if (a) actors.set(sender.id, a);
      else actors.delete(sender.id);
    },
    terminalId: getAppConfig().terminalId,
  };
}

// ── Satellite ───────────────────────────────────────────────────────────────────────────────

async function forward(channel: string, sender: WebContents, args: unknown[]): Promise<unknown> {
  const link = lan?.mainLink;
  if (!link) throw new RefusedError('lan.errors.unpaired');
  const { result, session } = await link.rpc(channel, args, sessions.get(sender.id) ?? null);
  if (session === null) sessions.delete(sender.id);
  else if (session) sessions.set(sender.id, session);
  if (result.ok) return result.data;
  if (result.error.startsWith('LICENSE:')) {
    sender.send('license:refused', result.error.slice('LICENSE:'.length));
  }
  throw new Error(result.error);
}

/** Who is signed in at this window, asked of the main till (which re-reads the user). */
async function remoteActor(sender: WebContents): Promise<Actor | null> {
  if (!lan?.mainLink || !sessions.has(sender.id)) return null;
  try {
    return (await forward('auth:getProfile', sender, [])) as Actor | null;
  } catch {
    return null;
  }
}

async function satelliteCall(
  channel: string,
  sender: WebContents,
  args: unknown[],
): Promise<unknown> {
  // The main till's licence is the one that gates (and the one the screen shows).
  if (channel === 'license:status' || channel === 'license:checkNow') {
    return forward('license:status', sender, []);
  }
  const print = PRINTERS[channel];
  if (print) return satellitePrint(channel, print, sender, args);
  if (runsOverLan(channel)) return forward(channel, sender, args);

  if (REFUSED_ON_SATELLITE.test(channel)) throw new RefusedError('lan.errors.mainOnly');
  const actor = NEEDS_REMOTE_ACTOR.has(channel) ? await remoteActor(sender) : null;
  return invokeHandler(channel, { actor, setActor: () => undefined, terminalId: '' }, args);
}

/** Prints on this satellite's printer: the visit and the plan come from the main till. */
async function satellitePrint(
  channel: string,
  print: (typeof PRINTERS)[string],
  sender: WebContents,
  args: unknown[],
): Promise<unknown> {
  try {
    const appointment = (await forward('appointments:getById', sender, [args[0]])) as {
      id: string;
      appointmentNumber: string;
    } | null;
    if (!appointment) return { success: false, error: 'Appointment not found' };
    if (channel === 'print:prescription') {
      const status = (await forward('license:status', sender, [])) as LicenseStatusDto;
      if (!status.features.includes('printPrescription')) {
        sender.send('license:refused', 'license.feature.printPrescription');
        return { success: false, error: 'license.feature.printPrescription' };
      }
    }
    return print(appointment);
  } catch (error) {
    log.warn(`[${channel}] on satellite failed`, error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
