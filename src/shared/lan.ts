/**
 * Satellite tills on the clinic LAN (src/main/lan). One MAIN till holds the database, the
 * licence and the cloud sync; satellites forward every call to it. Shared by main and renderer.
 */

export type LanRole = 'main' | 'satellite';

/** A satellite's line to its main till. */
export type LanLinkState =
  | 'connecting'
  | 'online'
  /** The main till does not answer (off, network, firewall). */
  | 'unreachable'
  /** The main till no longer knows this satellite (revoked). */
  | 'unpaired'
  /** Another till answers at the address (another clinic's lineage). */
  | 'superseded'
  /** Different major.minor versions: update both. */
  | 'version';

export interface LanLinkDto {
  role: LanRole;
  mainUrl: string | null;
  state: LanLinkState | null;
  mainVersion: string | null;
  clinicName: string | null;
  lastContactAt: string | null;
}

export interface LanDeviceDto {
  id: string;
  name: string;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  active: boolean;
}

/** Settings → Satellite tills, on the main till. */
export interface LanStatusDto {
  enabled: boolean;
  port: number;
  serving: boolean;
  /** i18n key (`lan.errors.*`) when the server could not start. */
  error: string | null;
  addresses: string[];
  pairing: { code: string; expiresAt: string } | null;
  devices: LanDeviceDto[];
  /** Satellites the licence allows (`terminals - 1`); null = unlimited. */
  deviceLimit: number | null;
}

export interface LanJoinInput {
  mainAddress: string;
  code: string;
}

export const DEFAULT_LAN_PORT = 5180;

/** Window events the main till sends (and forwards to its satellites over SSE). */
export interface DataChangedEvent {
  type: 'data:changed';
  entity: 'patients' | 'appointments' | 'doctors' | 'services' | 'users' | 'cases';
}
export type AppEvent = DataChangedEvent;

/** Same major.minor: the IPC contract is the same on both tills. */
export function versionsCompatible(a: string, b: string): boolean {
  const mm = (v: string) => v.split('.').slice(0, 2).join('.');
  return mm(a) === mm(b);
}
