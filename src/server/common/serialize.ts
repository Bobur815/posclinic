/**
 * JSON shapes the server returns. Prisma `Decimal` becomes a number (UZS), dates ISO strings.
 * `clinicId` and `syncedAt` are server bookkeeping and stay out of the contract row shapes.
 */

type Decimalish = { toNumber(): number } | number | string;

export const money = (v: Decimalish | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return v.toNumber();
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const isoReq = (d: Date) => d.toISOString();

interface PatientRow {
  id: string;
  patientCode: string;
  fullName: string;
  phone: string;
  birthDate: Date | null;
  gender: string | null;
  bloodType: string | null;
  allergies: string | null;
  address: string | null;
  city: string | null;
  regionCode?: string | null;
  districtCode?: string | null;
  chronicConditions?: string | null;
  notes: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const patientOut = (p: PatientRow) => ({
  id: p.id,
  patientCode: p.patientCode,
  fullName: p.fullName,
  phone: p.phone,
  birthDate: iso(p.birthDate),
  gender: p.gender,
  bloodType: p.bloodType,
  allergies: p.allergies,
  address: p.address,
  city: p.city,
  regionCode: p.regionCode ?? null,
  districtCode: p.districtCode ?? null,
  chronicConditions: p.chronicConditions ?? null,
  notes: p.notes,
  active: p.active,
  createdAt: isoReq(p.createdAt),
  updatedAt: isoReq(p.updatedAt),
});

interface DoctorRow {
  id: string;
  fullName: string;
  phone: string | null;
  specialty: string | null;
  licenseNo: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const doctorOut = (d: DoctorRow) => ({
  id: d.id,
  fullName: d.fullName,
  phone: d.phone,
  specialty: d.specialty,
  licenseNo: d.licenseNo,
  active: d.active,
  createdAt: isoReq(d.createdAt),
  updatedAt: isoReq(d.updatedAt),
});

interface ServiceRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: Decimalish;
  duration: number;
  kind?: string;
  isFollowUp?: boolean;
  resultType?: string | null;
  resultUnit?: string | null;
  referenceRange?: string | null;
  serviceTypeId?: string | null;
  mxik?: string | null;
  packageCode?: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const serviceOut = (s: ServiceRow) => ({
  id: s.id,
  code: s.code,
  name: s.name,
  description: s.description,
  price: money(s.price),
  duration: s.duration,
  kind: s.kind ?? 'PROCEDURE',
  isFollowUp: s.isFollowUp ?? false,
  resultType: s.resultType ?? null,
  resultUnit: s.resultUnit ?? null,
  referenceRange: s.referenceRange ?? null,
  serviceTypeId: s.serviceTypeId ?? null,
  mxik: s.mxik ?? null,
  packageCode: s.packageCode ?? null,
  active: s.active,
  createdAt: isoReq(s.createdAt),
  updatedAt: isoReq(s.updatedAt),
});

interface UserRow {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: string;
  active: boolean;
  passwordHash: string;
  staffTypeId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** For the web: never the hash. */
export const userOut = (u: UserRow) => ({
  id: u.id,
  fullName: u.fullName,
  phone: u.phone,
  email: u.email,
  role: u.role,
  active: u.active,
  staffTypeId: u.staffTypeId ?? null,
  createdAt: isoReq(u.createdAt),
  updatedAt: isoReq(u.updatedAt),
});

/** For the main till (sync pull): carries the bcrypt hash so web-made staff can sign in there. */
export const userSyncOut = (u: UserRow) => ({ ...userOut(u), passwordHash: u.passwordHash });

interface ItemRow {
  id: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: Decimalish;
  discount?: Decimalish;
  total: Decimalish;
  doctorId?: string | null;
  referralId?: string | null;
  status?: string;
  completedAt?: Date | null;
  sessions?: { id: string; number: number; plannedDate: Date | null; doneAt: Date | null }[];
}

interface AppointmentRow {
  id: string;
  appointmentNumber: string;
  patientId: string;
  doctorId: string | null;
  caseId?: string | null;
  appointmentDate: Date;
  status: string;
  totalAmount: Decimalish;
  discountAmount?: Decimalish;
  paidAmount: Decimalish;
  paymentStatus: string;
  paymentMethod: string | null;
  diagnosis: string | null;
  prescription: string | null;
  notes: string | null;
  terminalId: string | null;
  createdAt: Date;
  updatedAt: Date;
  items?: ItemRow[];
  patient?: { id: string; fullName: string; phone: string; patientCode: string } | null;
  doctor?: { id: string; fullName: string } | null;
}

export const appointmentOut = (a: AppointmentRow) => ({
  id: a.id,
  appointmentNumber: a.appointmentNumber,
  patientId: a.patientId,
  doctorId: a.doctorId,
  caseId: a.caseId ?? null,
  appointmentDate: isoReq(a.appointmentDate),
  status: a.status,
  totalAmount: money(a.totalAmount),
  discountAmount: money(a.discountAmount),
  paidAmount: money(a.paidAmount),
  paymentStatus: a.paymentStatus,
  paymentMethod: a.paymentMethod,
  diagnosis: a.diagnosis,
  prescription: a.prescription,
  notes: a.notes,
  terminalId: a.terminalId,
  createdAt: isoReq(a.createdAt),
  updatedAt: isoReq(a.updatedAt),
  items: (a.items ?? []).map((i) => ({
    id: i.id,
    serviceId: i.serviceId,
    serviceName: i.serviceName,
    quantity: i.quantity,
    unitPrice: money(i.unitPrice),
    discount: money(i.discount),
    total: money(i.total),
    doctorId: i.doctorId ?? null,
    referralId: i.referralId ?? null,
    status: i.status ?? 'WAITING',
    completedAt: iso(i.completedAt),
    sessions: (i.sessions ?? []).map((x) => ({
      id: x.id,
      number: x.number,
      plannedDate: iso(x.plannedDate),
      doneAt: iso(x.doneAt),
    })),
  })),
  ...(a.patient
    ? {
        patient: {
          id: a.patient.id,
          fullName: a.patient.fullName,
          phone: a.patient.phone,
          patientCode: a.patient.patientCode,
        },
      }
    : {}),
  ...(a.doctor ? { doctor: { id: a.doctor.id, fullName: a.doctor.fullName } } : {}),
});

// ── Clinical records (till v2.5): read-only on the web ─────────────────────────────────────

interface CaseRow {
  id: string;
  caseNumber: string;
  patientId: string;
  doctorId: string | null;
  status: string;
  complaint: string | null;
  diagnosis: string | null;
  openedAt: Date;
  closedAt: Date | null;
  updatedAt: Date;
}
export const caseOut = (c: CaseRow) => ({
  id: c.id,
  caseNumber: c.caseNumber,
  patientId: c.patientId,
  doctorId: c.doctorId,
  status: c.status,
  complaint: c.complaint,
  diagnosis: c.diagnosis,
  openedAt: isoReq(c.openedAt),
  closedAt: iso(c.closedAt),
  updatedAt: isoReq(c.updatedAt),
});

interface VitalsRow {
  id: string;
  caseId: string | null;
  heightCm: Decimalish | null;
  weightKg: Decimalish | null;
  temperature: Decimalish | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  pregnant: boolean | null;
  recordedAt: Date;
}
const optMoney = (v: Decimalish | null) => (v === null ? null : money(v));
export const vitalsOut = (v: VitalsRow) => ({
  id: v.id,
  caseId: v.caseId,
  heightCm: optMoney(v.heightCm),
  weightKg: optMoney(v.weightKg),
  temperature: optMoney(v.temperature),
  bpSystolic: v.bpSystolic,
  bpDiastolic: v.bpDiastolic,
  pregnant: v.pregnant,
  recordedAt: isoReq(v.recordedAt),
});

interface ResultRow {
  id: string;
  caseId: string | null;
  serviceId: string;
  outcome: string | null;
  value: Decimalish | null;
  unit: string | null;
  finding: string | null;
  comment: string | null;
  enteredAt: Date | null;
  confirmedAt: Date | null;
}
export const resultOut = (r: ResultRow & { serviceName?: string | null }) => ({
  id: r.id,
  caseId: r.caseId,
  serviceId: r.serviceId,
  serviceName: r.serviceName ?? null,
  outcome: r.outcome,
  value: optMoney(r.value),
  unit: r.unit,
  finding: r.finding,
  comment: r.comment,
  enteredAt: iso(r.enteredAt),
  confirmedAt: iso(r.confirmedAt),
});
