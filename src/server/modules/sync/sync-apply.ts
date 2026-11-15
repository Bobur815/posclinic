import { normalizePhone } from '../../../shared/phone';
import { TILL_ROLES } from '../../common/roles';

/**
 * Pure push logic (`POST /sync/push`): validate each row, decide last-write-wins, enforce clinic
 * scoping and per-clinic uniqueness, and hand the rows that win to a `SyncDb`. The database is
 * injected so the rules are testable without Nest or Postgres. Contract: `.claude/rules/server-api.md`.
 */

/**
 * Apply order: what a row points at arrives first. v2.5 adds cases, referrals, vitals and
 * results (the till's clinical records); an older till simply never sends them.
 */
export const SYNC_ENTITIES = [
  'users',
  'doctors',
  'services',
  'patients',
  'cases',
  'referrals',
  'appointments',
  'vitals',
  'results',
] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

/** Rows per entity per call. */
export const SYNC_BATCH_MAX = 200;

/** Last write wins: write a row only if it is new or strictly newer than what is stored. */
export function shouldApply(stored: Date | null | undefined, incoming: Date): boolean {
  return !stored || incoming.getTime() > stored.getTime();
}

// ── Normalized rows (what SyncDb writes) ────────────────────────────────────────────────────

interface Base {
  id: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export interface UserIn extends Base {
  fullName: string;
  phone: string;
  email: string | null;
  role: string;
  passwordHash: string;
}
export interface DoctorIn extends Base {
  fullName: string;
  phone: string | null;
  specialty: string | null;
  licenseNo: string | null;
}
export interface ServiceIn extends Base {
  code: string;
  name: string;
  description: string | null;
  price: number;
  duration: number;
  kind: string;
  isFollowUp: boolean;
  resultType: string | null;
  resultUnit: string | null;
  referenceRange: string | null;
}
export interface PatientIn extends Base {
  patientCode: string;
  fullName: string;
  phone: string;
  birthDate: Date | null;
  gender: string | null;
  bloodType: string | null;
  allergies: string | null;
  address: string | null;
  city: string | null;
  regionCode: string | null;
  districtCode: string | null;
  chronicConditions: string | null;
  notes: string | null;
}
export interface SessionIn {
  id: string;
  number: number;
  plannedDate: Date | null;
  doneAt: Date | null;
  doneBy: string | null;
}
export interface ItemIn {
  id: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  doctorId: string | null;
  referralId: string | null;
  status: string;
  performedBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  sessions: SessionIn[];
}
export interface AppointmentIn extends Omit<Base, 'active'> {
  appointmentNumber: string;
  patientId: string;
  /** Null for an analysis / procedure order (v2.5). */
  doctorId: string | null;
  caseId: string | null;
  appointmentDate: Date;
  status: string;
  totalAmount: number;
  discountAmount: number;
  paidAmount: number;
  paymentStatus: string;
  paymentMethod: string | null;
  diagnosis: string | null;
  prescription: string | null;
  notes: string | null;
  terminalId: string | null;
  items: ItemIn[];
}

export interface CaseIn extends Omit<Base, 'active'> {
  caseNumber: string;
  patientId: string;
  doctorId: string | null;
  status: string;
  complaint: string | null;
  diagnosis: string | null;
  openedAt: Date;
  closedAt: Date | null;
}
export interface ReferralIn extends Omit<Base, 'active'> {
  caseId: string;
  patientId: string;
  doctorId: string | null;
  serviceId: string;
  quantity: number;
  perDay: number | null;
  days: number | null;
  instructions: string | null;
  registeredQty: number;
  status: string;
}
export interface VitalsIn {
  id: string;
  patientId: string;
  caseId: string | null;
  heightCm: number | null;
  weightKg: number | null;
  temperature: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  pregnant: boolean | null;
  complaints: string | null;
  recordedBy: string | null;
  recordedAt: Date;
  updatedAt: Date;
}
export interface ResultIn extends Omit<Base, 'active'> {
  itemId: string;
  caseId: string | null;
  patientId: string;
  serviceId: string;
  outcome: string | null;
  value: number | null;
  unit: string | null;
  finding: string | null;
  comment: string | null;
  sampleTakenAt: Date | null;
  enteredBy: string | null;
  enteredAt: Date | null;
  confirmedBy: string | null;
  confirmedAt: Date | null;
}

export interface RowMap {
  users: UserIn;
  doctors: DoctorIn;
  services: ServiceIn;
  patients: PatientIn;
  cases: CaseIn;
  referrals: ReferralIn;
  appointments: AppointmentIn;
  vitals: VitalsIn;
  results: ResultIn;
}

export interface StoredRef {
  id: string;
  clinicId: string;
  updatedAt: Date;
}

/** What the apply step needs from the database (one transaction). */
export interface SyncDb {
  /** Rows with these ids in ANY clinic (so a foreign id is caught). */
  find(entity: SyncEntity, ids: string[]): Promise<StoredRef[]>;
  /** Id of the user in `clinicId` holding `phone`, or null. */
  userIdByPhone(clinicId: string, phone: string): Promise<string | null>;
  /** Id of the service in `clinicId` with `code`, or null. */
  serviceIdByCode(clinicId: string, code: string): Promise<string | null>;
  write<E extends SyncEntity>(
    entity: E,
    clinicId: string,
    row: RowMap[E],
    syncedAt: Date,
  ): Promise<void>;
}

export type RejectReason =
  | 'invalid'
  | 'foreign_id'
  | 'phone_invalid'
  | 'phone_taken'
  | 'role_invalid'
  | 'code_taken'
  | 'missing_patient'
  | 'missing_doctor'
  | 'missing_service'
  | 'missing_case';

export interface Rejected {
  entity: SyncEntity;
  id: string;
  reason: RejectReason;
}

export interface PushResult {
  accepted: Record<SyncEntity, number>;
  rejected: Rejected[];
  /** Rows actually written (new or newer); the rest were already up to date. */
  written: number;
}

export type PushBody = Partial<Record<SyncEntity, unknown[]>>;

// ── Validation ──────────────────────────────────────────────────────────────────────────────

class Invalid extends Error {
  constructor(readonly reason: RejectReason = 'invalid') {
    super(reason);
  }
}

const TEXT_MAX = 5000;
type Raw = Record<string, unknown>;

function str(r: Raw, k: string, max = 500): string {
  const v = r[k];
  if (typeof v !== 'string' || v.trim() === '' || v.length > max) throw new Invalid();
  return v;
}
function optStr(r: Raw, k: string, max = TEXT_MAX): string | null {
  const v = r[k];
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' || v.length > max) throw new Invalid();
  return v;
}
function date(r: Raw, k: string): Date {
  const v = r[k];
  const d = typeof v === 'string' || v instanceof Date ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) throw new Invalid();
  return d;
}
function optDate(r: Raw, k: string): Date | null {
  return r[k] === null || r[k] === undefined || r[k] === '' ? null : date(r, k);
}
function num(r: Raw, k: string, { int = false, min = 0 } = {}): number {
  const v = typeof r[k] === 'string' ? Number(r[k]) : r[k];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || (int && !Number.isInteger(v))) {
    throw new Invalid();
  }
  return v;
}
function optNum(r: Raw, k: string, opts: { int?: boolean; min?: number } = {}): number | null {
  return r[k] === null || r[k] === undefined || r[k] === '' ? null : num(r, k, opts);
}
function optBool(r: Raw, k: string): boolean | null {
  return r[k] === null || r[k] === undefined ? null : bool(r, k);
}
function oneOf(r: Raw, k: string, allowed: readonly string[], fallback?: string): string {
  const v = r[k] === undefined || r[k] === null ? fallback : r[k];
  if (typeof v !== 'string' || !allowed.includes(v)) throw new Invalid();
  return v;
}
function optOneOf(r: Raw, k: string, allowed: readonly string[]): string | null {
  return r[k] === null || r[k] === undefined ? null : oneOf(r, k, allowed);
}
const SERVICE_KINDS = ['CONSULTATION', 'ANALYSIS', 'PROCEDURE'] as const;
const RESULT_TYPES = ['QUALITATIVE', 'QUANTITATIVE', 'TEXT'] as const;
const ITEM_STATUSES = ['WAITING', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
const CASE_STATUSES = [
  'OPEN',
  'WAITING_DOCTOR',
  'WAITING_ANALYSIS',
  'RESULT_READY',
  'ON_TREATMENT',
  'CLOSED',
] as const;
const REFERRAL_STATUSES = ['PENDING', 'PARTIAL', 'REGISTERED', 'CANCELLED'] as const;

function bool(r: Raw, k: string, fallback = true): boolean {
  const v = r[k];
  if (v === undefined || v === null) return fallback;
  if (typeof v !== 'boolean') throw new Invalid();
  return v;
}
function base(r: Raw): Base {
  return {
    id: str(r, 'id', 64),
    active: bool(r, 'active'),
    createdAt: date(r, 'createdAt'),
    updatedAt: date(r, 'updatedAt'),
  };
}

const PARSERS: {
  [E in 'users' | 'doctors' | 'services' | 'patients' | 'appointments']: (r: Raw) => RowMap[E];
} = {
  users: (r) => {
    const phone = normalizePhone(typeof r.phone === 'string' ? r.phone : null);
    if (!phone) throw new Invalid('phone_invalid');
    const role = str(r, 'role', 40);
    if (!(TILL_ROLES as readonly string[]).includes(role)) throw new Invalid('role_invalid');
    const passwordHash = str(r, 'passwordHash', 200);
    // bcrypt only: never accept something that looks like a plaintext password.
    if (!/^\$2[aby]\$\d{2}\$.{53}$/.test(passwordHash)) throw new Invalid();
    return {
      ...base(r),
      fullName: str(r, 'fullName'),
      phone,
      email: optStr(r, 'email', 200),
      role,
      passwordHash,
    };
  },
  doctors: (r) => ({
    ...base(r),
    fullName: str(r, 'fullName'),
    phone: optStr(r, 'phone', 40),
    specialty: optStr(r, 'specialty', 200),
    licenseNo: optStr(r, 'licenseNo', 100),
  }),
  services: (r) => ({
    ...base(r),
    code: str(r, 'code', 100),
    name: str(r, 'name'),
    description: optStr(r, 'description'),
    price: num(r, 'price'),
    duration: num(r, 'duration', { int: true }),
    // A v2.4 till sends none of these: they keep their defaults.
    kind: oneOf(r, 'kind', SERVICE_KINDS, 'PROCEDURE'),
    isFollowUp: bool(r, 'isFollowUp', false),
    resultType: optOneOf(r, 'resultType', RESULT_TYPES),
    resultUnit: optStr(r, 'resultUnit', 100),
    referenceRange: optStr(r, 'referenceRange', 100),
  }),
  patients: (r) => ({
    ...base(r),
    patientCode: str(r, 'patientCode', 100),
    fullName: str(r, 'fullName'),
    phone: str(r, 'phone', 40),
    birthDate: optDate(r, 'birthDate'),
    gender: optStr(r, 'gender', 20),
    bloodType: optStr(r, 'bloodType', 10),
    allergies: optStr(r, 'allergies'),
    address: optStr(r, 'address'),
    city: optStr(r, 'city', 200),
    regionCode: optStr(r, 'regionCode', 10),
    districtCode: optStr(r, 'districtCode', 10),
    chronicConditions: optStr(r, 'chronicConditions'),
    notes: optStr(r, 'notes'),
  }),
  appointments: (r) => {
    const items = r.items === undefined || r.items === null ? [] : r.items;
    if (!Array.isArray(items) || items.length > 100) throw new Invalid();
    return {
      id: str(r, 'id', 64),
      createdAt: date(r, 'createdAt'),
      updatedAt: date(r, 'updatedAt'),
      appointmentNumber: str(r, 'appointmentNumber', 100),
      patientId: str(r, 'patientId', 64),
      doctorId: optStr(r, 'doctorId', 64),
      caseId: optStr(r, 'caseId', 64),
      appointmentDate: date(r, 'appointmentDate'),
      status: str(r, 'status', 40),
      totalAmount: num(r, 'totalAmount'),
      discountAmount: optNum(r, 'discountAmount') ?? 0,
      paidAmount: num(r, 'paidAmount'),
      paymentStatus: str(r, 'paymentStatus', 40),
      paymentMethod: optStr(r, 'paymentMethod', 40),
      diagnosis: optStr(r, 'diagnosis'),
      prescription: optStr(r, 'prescription'),
      notes: optStr(r, 'notes'),
      terminalId: optStr(r, 'terminalId', 100),
      items: items.map((raw) => {
        if (!raw || typeof raw !== 'object') throw new Invalid();
        const i = raw as Raw;
        return {
          id: str(i, 'id', 64),
          serviceId: str(i, 'serviceId', 64),
          serviceName: str(i, 'serviceName'),
          quantity: num(i, 'quantity', { int: true, min: 1 }),
          unitPrice: num(i, 'unitPrice'),
          discount: optNum(i, 'discount') ?? 0,
          total: num(i, 'total'),
          doctorId: optStr(i, 'doctorId', 64),
          referralId: optStr(i, 'referralId', 64),
          status: oneOf(i, 'status', ITEM_STATUSES, 'WAITING'),
          performedBy: optStr(i, 'performedBy', 64),
          startedAt: optDate(i, 'startedAt'),
          completedAt: optDate(i, 'completedAt'),
          sessions: (() => {
            const list = i.sessions === undefined || i.sessions === null ? [] : i.sessions;
            if (!Array.isArray(list) || list.length > 999) throw new Invalid();
            return list.map((rawS) => {
              if (!rawS || typeof rawS !== 'object') throw new Invalid();
              const x = rawS as Raw;
              return {
                id: str(x, 'id', 64),
                number: num(x, 'number', { int: true, min: 1 }),
                plannedDate: optDate(x, 'plannedDate'),
                doneAt: optDate(x, 'doneAt'),
                doneBy: optStr(x, 'doneBy', 64),
              };
            });
          })(),
        };
      }),
    };
  },
};

Object.assign(PARSERS, {
  cases: (r: Raw): CaseIn => ({
    id: str(r, 'id', 64),
    createdAt: date(r, 'createdAt'),
    updatedAt: date(r, 'updatedAt'),
    caseNumber: str(r, 'caseNumber', 100),
    patientId: str(r, 'patientId', 64),
    doctorId: optStr(r, 'doctorId', 64),
    status: oneOf(r, 'status', CASE_STATUSES),
    complaint: optStr(r, 'complaint'),
    diagnosis: optStr(r, 'diagnosis'),
    openedAt: date(r, 'openedAt'),
    closedAt: optDate(r, 'closedAt'),
  }),
  referrals: (r: Raw): ReferralIn => ({
    id: str(r, 'id', 64),
    createdAt: date(r, 'createdAt'),
    updatedAt: date(r, 'updatedAt'),
    caseId: str(r, 'caseId', 64),
    patientId: str(r, 'patientId', 64),
    doctorId: optStr(r, 'doctorId', 64),
    serviceId: str(r, 'serviceId', 64),
    quantity: num(r, 'quantity', { int: true, min: 1 }),
    perDay: optNum(r, 'perDay', { int: true, min: 1 }),
    days: optNum(r, 'days', { int: true, min: 1 }),
    instructions: optStr(r, 'instructions', 1000),
    registeredQty: num(r, 'registeredQty', { int: true }),
    status: oneOf(r, 'status', REFERRAL_STATUSES),
  }),
  vitals: (r: Raw): VitalsIn => ({
    id: str(r, 'id', 64),
    patientId: str(r, 'patientId', 64),
    caseId: optStr(r, 'caseId', 64),
    heightCm: optNum(r, 'heightCm'),
    weightKg: optNum(r, 'weightKg'),
    temperature: optNum(r, 'temperature'),
    bpSystolic: optNum(r, 'bpSystolic', { int: true }),
    bpDiastolic: optNum(r, 'bpDiastolic', { int: true }),
    pregnant: optBool(r, 'pregnant'),
    complaints: optStr(r, 'complaints'),
    recordedBy: optStr(r, 'recordedBy', 64),
    recordedAt: date(r, 'recordedAt'),
    updatedAt: date(r, 'updatedAt'),
  }),
  results: (r: Raw): ResultIn => ({
    id: str(r, 'id', 64),
    createdAt: date(r, 'createdAt'),
    updatedAt: date(r, 'updatedAt'),
    itemId: str(r, 'itemId', 64),
    caseId: optStr(r, 'caseId', 64),
    patientId: str(r, 'patientId', 64),
    serviceId: str(r, 'serviceId', 64),
    outcome: optOneOf(r, 'outcome', ['POSITIVE', 'NEGATIVE']),
    value: (() => {
      const v =
        r.value === null || r.value === undefined || r.value === '' ? null : Number(r.value);
      if (v !== null && !Number.isFinite(v)) throw new Invalid();
      return v;
    })(),
    unit: optStr(r, 'unit', 100),
    finding: optStr(r, 'finding', 500),
    comment: optStr(r, 'comment'),
    sampleTakenAt: optDate(r, 'sampleTakenAt'),
    enteredBy: optStr(r, 'enteredBy', 64),
    enteredAt: optDate(r, 'enteredAt'),
    confirmedBy: optStr(r, 'confirmedBy', 64),
    confirmedAt: optDate(r, 'confirmedAt'),
  }),
});

const PARSE = PARSERS as unknown as { [E in SyncEntity]: (r: Raw) => RowMap[E] };

const rawId = (raw: unknown) => {
  const id = raw && typeof raw === 'object' ? (raw as Raw).id : undefined;
  return typeof id === 'string' ? id.slice(0, 64) : '';
};

// ── Apply ───────────────────────────────────────────────────────────────────────────────────

/**
 * Apply a push for `clinicId` in contract order (users, doctors, services, patients,
 * appointments). A bad row is rejected and the rest go on. Sending the same batch twice writes
 * nothing the second time. Batch size is checked by the caller.
 */
export async function applyPush(
  db: SyncDb,
  clinicId: string,
  body: PushBody,
  now: Date,
): Promise<PushResult> {
  const accepted = Object.fromEntries(SYNC_ENTITIES.map((e) => [e, 0])) as Record<
    SyncEntity,
    number
  >;
  const rejected: Rejected[] = [];
  let written = 0;

  /** Ids already known to be in this clinic (stored before, or written in this call). */
  const ours = Object.fromEntries(SYNC_ENTITIES.map((e) => [e, new Set<string>()])) as Record<
    SyncEntity,
    Set<string>
  >;
  const inClinic = async (entity: SyncEntity, ids: string[]): Promise<Set<string>> => {
    const unknown = [...new Set(ids)].filter((id) => !ours[entity].has(id));
    if (unknown.length > 0) {
      for (const s of await db.find(entity, unknown)) {
        if (s.clinicId === clinicId) ours[entity].add(s.id);
      }
    }
    return ours[entity];
  };

  for (const entity of SYNC_ENTITIES) {
    const raws = body[entity] ?? [];
    const rows: RowMap[SyncEntity][] = [];
    for (const raw of raws) {
      try {
        if (!raw || typeof raw !== 'object') throw new Invalid();
        rows.push(PARSE[entity](raw as Raw));
      } catch (e) {
        rejected.push({
          entity,
          id: rawId(raw),
          reason: e instanceof Invalid ? e.reason : 'invalid',
        });
      }
    }
    if (rows.length === 0) continue;

    const stored = new Map<string, StoredRef>();
    for (const s of await db.find(
      entity,
      rows.map((r) => r.id),
    )) {
      stored.set(s.id, s);
    }

    for (const row of rows) {
      const reject = (reason: RejectReason) => rejected.push({ entity, id: row.id, reason });
      const prev = stored.get(row.id);
      if (prev && prev.clinicId !== clinicId) {
        reject('foreign_id');
        continue;
      }
      if (!shouldApply(prev?.updatedAt, row.updatedAt)) {
        accepted[entity]++; // already have this version or a newer one (e.g. a web edit)
        continue;
      }

      if (entity === 'users') {
        const owner = await db.userIdByPhone(clinicId, (row as UserIn).phone);
        if (owner && owner !== row.id) {
          reject('phone_taken');
          continue;
        }
      } else if (entity === 'services') {
        const owner = await db.serviceIdByCode(clinicId, (row as ServiceIn).code);
        if (owner && owner !== row.id) {
          reject('code_taken');
          continue;
        }
      } else if (entity === 'appointments') {
        const a = row as AppointmentIn;
        if (!(await inClinic('patients', [a.patientId])).has(a.patientId)) {
          reject('missing_patient');
          continue;
        }
        if (a.doctorId && !(await inClinic('doctors', [a.doctorId])).has(a.doctorId)) {
          reject('missing_doctor');
          continue;
        }
        if (a.caseId && !(await inClinic('cases', [a.caseId])).has(a.caseId)) {
          reject('missing_case');
          continue;
        }
        const serviceIds = a.items.map((i) => i.serviceId);
        const services = await inClinic('services', serviceIds);
        if (!serviceIds.every((id) => services.has(id))) {
          reject('missing_service');
          continue;
        }
      } else if (entity === 'cases' || entity === 'vitals' || entity === 'results') {
        const c = row as { patientId: string; caseId?: string | null; serviceId?: string };
        if (!(await inClinic('patients', [c.patientId])).has(c.patientId)) {
          reject('missing_patient');
          continue;
        }
        if (c.caseId && !(await inClinic('cases', [c.caseId])).has(c.caseId)) {
          reject('missing_case');
          continue;
        }
        if (c.serviceId && !(await inClinic('services', [c.serviceId])).has(c.serviceId)) {
          reject('missing_service');
          continue;
        }
      } else if (entity === 'referrals') {
        const r = row as ReferralIn;
        if (!(await inClinic('cases', [r.caseId])).has(r.caseId)) {
          reject('missing_case');
          continue;
        }
        if (!(await inClinic('patients', [r.patientId])).has(r.patientId)) {
          reject('missing_patient');
          continue;
        }
        if (!(await inClinic('services', [r.serviceId])).has(r.serviceId)) {
          reject('missing_service');
          continue;
        }
      }

      await db.write(entity, clinicId, row as never, now);
      stored.set(row.id, { id: row.id, clinicId, updatedAt: row.updatedAt });
      ours[entity].add(row.id);
      accepted[entity]++;
      written++;
    }
  }

  return { accepted, rejected, written };
}

/** Each array present must be an array of at most `SYNC_BATCH_MAX` rows. */
export function batchError(body: unknown): string | null {
  if (!body || typeof body !== 'object') return 'body';
  for (const entity of SYNC_ENTITIES) {
    const v = (body as Raw)[entity];
    if (v === undefined || v === null) continue;
    if (!Array.isArray(v)) return entity;
    if (v.length > SYNC_BATCH_MAX) return entity;
  }
  return null;
}
