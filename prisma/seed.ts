/**
 * DEMO data for a local / staging posclinic server. Never run against production.
 * Demo login: +998901112233 / admin123 (demo only). Real clinics are created by their first
 * licensed sync (Clinic.id = posgro storeId), never by this seed.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PARASITOLOGY_SERVICES } from '../src/main/database/seed-parasitology';

const prisma = new PrismaClient();
const CLINIC_ID = 'demo-clinic';
const DAY = 24 * 60 * 60 * 1000;

/** Stable ids, so re-running the seed updates instead of duplicating. */
const uid = (kind: string, n: number) =>
  `00000000-0000-4000-8${kind}-${String(n).padStart(12, '0')}`;

const PRICES: Record<string, number> = {
  'PAR-CONS': 100_000,
  'PAR-CONS2': 60_000,
  'PAR-OP': 50_000,
  'PAR-ENT': 40_000,
  'PAR-GIA': 90_000,
  'PAR-ASC': 90_000,
  'PAR-TOX': 95_000,
  'PAR-ECH': 110_000,
  'PAR-OPI': 95_000,
  'PAR-MAL': 70_000,
};

async function main() {
  const now = new Date();
  const stamp = { createdAt: now, updatedAt: now, syncedAt: now };

  await prisma.clinic.upsert({
    where: { id: CLINIC_ID },
    update: {},
    create: {
      id: CLINIC_ID,
      name: 'Demo Parazitologiya Klinikasi',
      plan: 'PRO',
      expiresAt: new Date(now.getTime() + 30 * DAY),
      blockAt: new Date(now.getTime() + 33 * DAY),
    },
  });

  const demoHash = await bcrypt.hash('admin123', 10);
  const users = [
    { n: 1, fullName: 'Demo Admin', phone: '+998901112233', role: 'CLINIC_ADMIN' },
    { n: 2, fullName: 'Demo Qabulxona', phone: '+998901112244', role: 'RECEPTIONIST' },
  ];
  for (const u of users) {
    const { n, ...data } = u;
    await prisma.user.upsert({
      where: { id: uid('001', n) },
      update: {},
      create: { id: uid('001', n), clinicId: CLINIC_ID, ...data, passwordHash: demoHash, ...stamp },
    });
  }

  const doctors = [
    { n: 1, fullName: 'Dr. Aziza Karimova', specialty: 'Parazitolog' },
    { n: 2, fullName: 'Dr. Jasur Toshmatov', specialty: 'Parazitolog' },
  ];
  for (const d of doctors) {
    const { n, ...data } = d;
    await prisma.doctor.upsert({
      where: { id: uid('002', n) },
      update: {},
      create: { id: uid('002', n), clinicId: CLINIC_ID, ...data, ...stamp },
    });
  }

  const services = PARASITOLOGY_SERVICES.map((s, i) => ({
    id: uid('003', i + 1),
    code: s.code,
    name: s.uz,
    price: PRICES[s.code] ?? 50_000,
    duration: s.duration,
  }));
  for (const s of services) {
    await prisma.service.upsert({
      where: { id: s.id },
      update: {},
      create: { ...s, clinicId: CLINIC_ID, ...stamp },
    });
  }

  const patients = [
    { n: 1, fullName: 'Demo Bemor Bir', phone: '+998900000001', gender: 'MALE' },
    { n: 2, fullName: 'Demo Bemor Ikki', phone: '+998900000002', gender: 'FEMALE' },
    { n: 3, fullName: 'Demo Bemor Uch', phone: '+998900000003', gender: 'FEMALE' },
  ];
  for (const p of patients) {
    const { n, ...data } = p;
    await prisma.patient.upsert({
      where: { id: uid('004', n) },
      update: {},
      create: {
        id: uid('004', n),
        clinicId: CLINIC_ID,
        patientCode: `P-${String(n).padStart(5, '0')}`,
        ...data,
        city: 'Toshkent',
        ...stamp,
      },
    });
  }

  // A few visits over the last days: paid, partially paid, scheduled, cancelled.
  const visits = [
    { n: 1, patient: 1, doctor: 1, daysAgo: 0, svc: [0, 2], paid: 'all', status: 'COMPLETED' },
    { n: 2, patient: 2, doctor: 2, daysAgo: 0, svc: [0, 4], paid: 'half', status: 'IN_PROGRESS' },
    { n: 3, patient: 3, doctor: 1, daysAgo: 1, svc: [1], paid: 'all', status: 'COMPLETED' },
    { n: 4, patient: 1, doctor: 2, daysAgo: 3, svc: [3, 9], paid: 'none', status: 'SCHEDULED' },
    { n: 5, patient: 2, doctor: 1, daysAgo: 5, svc: [0], paid: 'none', status: 'CANCELLED' },
  ];
  for (const v of visits) {
    const id = uid('005', v.n);
    const items = v.svc.map((i, k) => ({
      id: uid('006', v.n * 10 + k),
      serviceId: services[i].id,
      serviceName: services[i].name,
      quantity: 1,
      unitPrice: services[i].price,
      total: services[i].price,
    }));
    const total = items.reduce((s, i) => s + i.total, 0);
    const paid = v.paid === 'all' ? total : v.paid === 'half' ? Math.round(total / 2) : 0;
    const exists = await prisma.appointment.findUnique({ where: { id } });
    if (exists) continue;
    await prisma.appointment.create({
      data: {
        id,
        clinicId: CLINIC_ID,
        appointmentNumber: `A-${String(v.n).padStart(5, '0')}`,
        patientId: uid('004', v.patient),
        doctorId: uid('002', v.doctor),
        appointmentDate: new Date(now.getTime() - v.daysAgo * DAY),
        status: v.status,
        totalAmount: total,
        paidAmount: paid,
        paymentStatus: paid >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING',
        paymentMethod: paid > 0 ? 'CASH' : null,
        terminalId: 'demo-main',
        ...stamp,
        items: { create: items },
      },
    });
  }

  console.log(`Seeded demo clinic "${CLINIC_ID}" (login +998901112233 / admin123, demo only).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
