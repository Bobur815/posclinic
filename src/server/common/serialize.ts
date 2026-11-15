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
  total: Decimalish;
}

interface AppointmentRow {
  id: string;
  appointmentNumber: string;
  patientId: string;
  doctorId: string;
  appointmentDate: Date;
  status: string;
  totalAmount: Decimalish;
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
  appointmentDate: isoReq(a.appointmentDate),
  status: a.status,
  totalAmount: money(a.totalAmount),
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
    total: money(i.total),
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
