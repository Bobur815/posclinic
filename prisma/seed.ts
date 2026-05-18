import {
  AppointmentStatus,
  ClinicType,
  Gender,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  SubscriptionStatus,
  SubscriptionTier,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding POSCLINIC database...\n');

  // ── 1. System Tenant + PLATFORM_ADMIN ────────────────────────────────────────
  const systemTenant = await prisma.tenant.upsert({
    where: { clinicCode: 'PC-SYSTEM' },
    update: {},
    create: {
      organizationName: 'POSCLINIC System',
      slug: 'posclinic-system',
      clinicCode: 'PC-SYSTEM',
      contactEmail: 'system@posclinic.uz',
      city: 'Tashkent',
      subscriptionTier: SubscriptionTier.ENTERPRISE,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      isActive: true,
    },
  });

  const systemClinic = await prisma.clinic.upsert({
    where: { id: 'system-clinic-001' },
    update: {},
    create: {
      id: 'system-clinic-001',
      tenantId: systemTenant.id,
      name: 'POSCLINIC System',
      type: ClinicType.OTHER,
      licenseNo: 'SYSTEM',
      active: true,
    },
  });

  const platformAdminPassword = await bcrypt.hash('ErBo150893', 10);
  const platformAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: systemTenant.id, email: 'bobur@posclinic.uz' } },
    update: { password: platformAdminPassword },
    create: {
      tenantId: systemTenant.id,
      clinicId: systemClinic.id,
      email: 'bobur@posclinic.uz',
      password: platformAdminPassword,
      firstName: 'Bobur',
      lastName: 'Ergashev',
      role: UserRole.PLATFORM_ADMIN,
      isActive: true,
    },
  });

  console.log('✅ PLATFORM_ADMIN created');
  console.log(`   Email    : ${platformAdmin.email}`);
  console.log(`   Password : ErBo150893`);
  console.log(`   Role     : PLATFORM_ADMIN\n`);

  // ── 2. Demo Tenant + Clinic ────────────────────────────────────────────────
  const demoTenant = await prisma.tenant.upsert({
    where: { clinicCode: 'PC-DEMO01' },
    update: {},
    create: {
      organizationName: 'Najot Shifo Klinikasi',
      slug: 'najot-shifo',
      clinicCode: 'PC-DEMO01',
      contactEmail: 'info@najotshifo.uz',
      contactPhone: '+998712345678',
      city: 'Tashkent',
      region: 'Yunusobod',
      subscriptionTier: SubscriptionTier.TRIAL,
      subscriptionStatus: SubscriptionStatus.TRIAL,
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      isActive: true,
    },
  });

  const clinic = await prisma.clinic.upsert({
    where: { id: 'demo-clinic-001' },
    update: {},
    create: {
      id: 'demo-clinic-001',
      tenantId: demoTenant.id,
      name: 'Najot Shifo Klinikasi',
      type: ClinicType.GENERAL,
      address: 'Toshkent sh., Yunusobod tumani, 19-mavze, 45-uy',
      phone: '+998712345678',
      email: 'info@najotshifo.uz',
      licenseNo: 'LIC-2024-00142',
      active: true,
    },
  });

  console.log(`✅ Demo tenant: "${demoTenant.organizationName}" (clinicCode: ${demoTenant.clinicCode})`);
  console.log(`✅ Demo clinic: "${clinic.name}" (id: ${clinic.id})\n`);

  // ── 3. Tenant users ─────────────────────────────────────────────────────────
  const superAdminPassword = await bcrypt.hash('admin123', 10);
  const staffPassword = await bcrypt.hash('staff123', 10);

  const tenantOwner = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: demoTenant.id, email: 'admin@najotshifo.uz' } },
    update: {},
    create: {
      tenantId: demoTenant.id,
      email: 'admin@najotshifo.uz',
      password: superAdminPassword,
      firstName: 'Aziza',
      lastName: 'Karimova',
      role: UserRole.SUPERADMIN,
      isActive: true,
    },
  });

  const clinicManager = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: demoTenant.id, email: 'manager@najotshifo.uz' } },
    update: {},
    create: {
      tenantId: demoTenant.id,
      clinicId: clinic.id,
      email: 'manager@najotshifo.uz',
      password: staffPassword,
      firstName: 'Nilufar',
      lastName: 'Yusupova',
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  console.log('✅ Tenant users created');
  console.log(`   SUPERADMIN : ${tenantOwner.email}    / admin123`);
  console.log(`   ADMIN      : ${clinicManager.email}  / staff123\n`);

  // ── 4. Doctors ─────────────────────────────────────────────────────────────
  const doctorPassword = await bcrypt.hash('doctor123', 10);

  const doctors = await Promise.all([
    prisma.doctor.upsert({
      where: { id: 'doctor-001' },
      update: {},
      create: {
        id: 'doctor-001',
        clinicId: clinic.id,
        fullName: 'Sardor Mirzayev',
        phone: '+998901000010',
        specialty: 'Terapevt',
        licenseNo: 'DOC-2020-0045',
        active: true,
      },
    }),
    prisma.doctor.upsert({
      where: { id: 'doctor-002' },
      update: {},
      create: {
        id: 'doctor-002',
        clinicId: clinic.id,
        fullName: 'Mohira Toshmatova',
        phone: '+998901000011',
        specialty: 'Kardiolog',
        licenseNo: 'DOC-2019-0112',
        active: true,
      },
    }),
    prisma.doctor.upsert({
      where: { id: 'doctor-003' },
      update: {},
      create: {
        id: 'doctor-003',
        clinicId: clinic.id,
        fullName: 'Jasur Xolmatov',
        phone: '+998901000012',
        specialty: 'Nevrolog',
        licenseNo: 'DOC-2021-0078',
        active: true,
      },
    }),
  ]);

  // Create NURSE user accounts for doctors
  const doctorEmails = [
    { email: 'sardor@najotshifo.uz', firstName: 'Sardor', lastName: 'Mirzayev' },
    { email: 'mohira@najotshifo.uz', firstName: 'Mohira', lastName: 'Toshmatova' },
    { email: 'jasur@najotshifo.uz', firstName: 'Jasur', lastName: 'Xolmatov' },
  ];

  await Promise.all(
    doctorEmails.map((d) =>
      prisma.user.upsert({
        where: { tenantId_email: { tenantId: demoTenant.id, email: d.email } },
        update: {},
        create: {
          tenantId: demoTenant.id,
          clinicId: clinic.id,
          email: d.email,
          password: doctorPassword,
          firstName: d.firstName,
          lastName: d.lastName,
          role: UserRole.NURSE,
          isActive: true,
        },
      }),
    ),
  );

  console.log(`✅ ${doctors.length} doctors created (NURSE login password: doctor123)\n`);

  // ── 5. Services ────────────────────────────────────────────────────────────
  const serviceData = [
    { id: 'svc-001', code: 'CONS-01', name: "Dastlabki ko'rik",        price: 80000,  duration: 30 },
    { id: 'svc-002', code: 'CONS-02', name: "Takroriy ko'rik",         price: 50000,  duration: 20 },
    { id: 'svc-003', code: 'CARD-01', name: 'EKG',                      price: 60000,  duration: 20 },
    { id: 'svc-004', code: 'CARD-02', name: 'EKG + Xulosa',             price: 90000,  duration: 30 },
    { id: 'svc-005', code: 'LAB-01',  name: 'Qon tahlili (umumiy)',     price: 40000,  duration: 15 },
    { id: 'svc-006', code: 'LAB-02',  name: 'Qon tahlili (biokimyo)',   price: 120000, duration: 20 },
    { id: 'svc-007', code: 'USG-01',  name: "USG (qorin bo'shlig'i)",   price: 100000, duration: 30 },
    { id: 'svc-008', code: 'USG-02',  name: 'USG (yurak)',              price: 150000, duration: 40 },
    { id: 'svc-009', code: 'PROC-01', name: 'Ukol (vena)',              price: 30000,  duration: 10 },
    { id: 'svc-010', code: 'PROC-02', name: 'Tomichilik (kapelnitsa)',  price: 80000,  duration: 60 },
  ];

  const services = await Promise.all(
    serviceData.map((s) =>
      prisma.service.upsert({
        where: { id: s.id },
        update: {},
        create: { ...s, clinicId: clinic.id, active: true },
      }),
    ),
  );

  console.log(`✅ ${services.length} services created\n`);

  // ── 6. Patients ────────────────────────────────────────────────────────────
  const patientData = [
    { id: 'pat-001', code: 'P-000001', fullName: 'Alisher Nazarov',    phone: '+998901100001', gender: Gender.MALE,   birthDate: new Date('1985-03-15'), bloodType: 'B(III)+' },
    { id: 'pat-002', code: 'P-000002', fullName: 'Gulnora Rashidova',  phone: '+998901100002', gender: Gender.FEMALE, birthDate: new Date('1992-07-22'), bloodType: 'A(II)+'  },
    { id: 'pat-003', code: 'P-000003', fullName: 'Sherzod Qodirov',    phone: '+998901100003', gender: Gender.MALE,   birthDate: new Date('1978-11-08'), bloodType: 'O(I)+'   },
    { id: 'pat-004', code: 'P-000004', fullName: 'Malika Umarova',     phone: '+998901100004', gender: Gender.FEMALE, birthDate: new Date('2000-05-30'), bloodType: 'AB(IV)+' },
    { id: 'pat-005', code: 'P-000005', fullName: 'Bobur Xasanov',      phone: '+998901100005', gender: Gender.MALE,   birthDate: new Date('1995-09-12'), bloodType: 'A(II)-'  },
    { id: 'pat-006', code: 'P-000006', fullName: 'Zulfiya Ergasheva',  phone: '+998901100006', gender: Gender.FEMALE, birthDate: new Date('1988-02-14'), bloodType: 'B(III)-' },
    { id: 'pat-007', code: 'P-000007', fullName: 'Sanjar Toshpulatov', phone: '+998901100007', gender: Gender.MALE,   birthDate: new Date('1972-06-25'), bloodType: 'O(I)-'   },
    { id: 'pat-008', code: 'P-000008', fullName: 'Dilnoza Yunusova',   phone: '+998901100008', gender: Gender.FEMALE, birthDate: new Date('2003-12-03'), bloodType: 'A(II)+'  },
  ];

  const patients = await Promise.all(
    patientData.map((p) =>
      prisma.patient.upsert({
        where: { id: p.id },
        update: {},
        create: {
          id: p.id,
          clinicId: clinic.id,
          patientCode: p.code,
          fullName: p.fullName,
          phone: p.phone,
          gender: p.gender,
          birthDate: p.birthDate,
          bloodType: p.bloodType,
          active: true,
        },
      }),
    ),
  );

  console.log(`✅ ${patients.length} patients created\n`);

  // ── 7. Appointments ────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const apptData = [
    {
      id: 'appt-001', num: 'A-000001',
      patientId: 'pat-001', doctorId: 'doctor-001',
      date: new Date(today.getTime() + 9 * 3600000),
      status: AppointmentStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.CASH,
      services: [{ svc: services[0], qty: 1 }, { svc: services[2], qty: 1 }],
    },
    {
      id: 'appt-002', num: 'A-000002',
      patientId: 'pat-002', doctorId: 'doctor-002',
      date: new Date(today.getTime() + 10 * 3600000),
      status: AppointmentStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.CARD,
      services: [{ svc: services[0], qty: 1 }, { svc: services[7], qty: 1 }],
    },
    {
      id: 'appt-003', num: 'A-000003',
      patientId: 'pat-003', doctorId: 'doctor-001',
      date: new Date(today.getTime() + 11 * 3600000),
      status: AppointmentStatus.SCHEDULED,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: null,
      services: [{ svc: services[1], qty: 1 }],
    },
    {
      id: 'appt-004', num: 'A-000004',
      patientId: 'pat-004', doctorId: 'doctor-003',
      date: new Date(today.getTime() + 12 * 3600000),
      status: AppointmentStatus.SCHEDULED,
      paymentStatus: PaymentStatus.PARTIAL,
      paymentMethod: PaymentMethod.CASH,
      services: [{ svc: services[0], qty: 1 }, { svc: services[4], qty: 1 }],
    },
    {
      id: 'appt-005', num: 'A-000005',
      patientId: 'pat-005', doctorId: 'doctor-002',
      date: new Date(today.getTime() + 14 * 3600000),
      status: AppointmentStatus.SCHEDULED,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: null,
      services: [{ svc: services[3], qty: 1 }, { svc: services[5], qty: 1 }],
    },
    {
      id: 'appt-006', num: 'A-000006',
      patientId: 'pat-006', doctorId: 'doctor-001',
      date: new Date(today.getTime() - 1 * 86400000 + 9 * 3600000),
      status: AppointmentStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.TRANSFER,
      services: [{ svc: services[0], qty: 1 }, { svc: services[6], qty: 1 }],
    },
    {
      id: 'appt-007', num: 'A-000007',
      patientId: 'pat-007', doctorId: 'doctor-003',
      date: new Date(today.getTime() - 1 * 86400000 + 11 * 3600000),
      status: AppointmentStatus.COMPLETED,
      paymentStatus: PaymentStatus.PAID,
      paymentMethod: PaymentMethod.CASH,
      services: [{ svc: services[0], qty: 1 }, { svc: services[8], qty: 2 }],
    },
    {
      id: 'appt-008', num: 'A-000008',
      patientId: 'pat-008', doctorId: 'doctor-002',
      date: new Date(today.getTime() - 2 * 86400000 + 10 * 3600000),
      status: AppointmentStatus.CANCELLED,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod: null,
      services: [{ svc: services[0], qty: 1 }],
    },
  ];

  for (const a of apptData) {
    const totalAmount = a.services.reduce((sum, i) => sum + Number(i.svc.price) * i.qty, 0);
    const paidAmount =
      a.paymentStatus === PaymentStatus.PAID
        ? totalAmount
        : a.paymentStatus === PaymentStatus.PARTIAL
          ? Math.floor(totalAmount / 2)
          : 0;

    await prisma.appointment.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id,
        clinicId: clinic.id,
        appointmentNumber: a.num,
        patientId: a.patientId,
        doctorId: a.doctorId,
        appointmentDate: a.date,
        status: a.status,
        totalAmount,
        paidAmount,
        paymentStatus: a.paymentStatus,
        paymentMethod: a.paymentMethod,
        synced: true,
        items: {
          create: a.services.map((i) => ({
            serviceId: i.svc.id,
            serviceName: i.svc.name,
            quantity: i.qty,
            unitPrice: i.svc.price,
            total: Number(i.svc.price) * i.qty,
          })),
        },
      },
    });
  }

  console.log(`✅ ${apptData.length} appointments created\n`);

  // ── 8. Clinic settings ─────────────────────────────────────────────────────
  const settingsData = [
    { key: 'currency',           value: 'UZS' },
    { key: 'timezone',           value: 'Asia/Tashkent' },
    { key: 'receipt_footer',     value: 'Bizga murojaat qilganingiz uchun rahmat!' },
    { key: 'appointment_prefix', value: 'A' },
    { key: 'patient_prefix',     value: 'P' },
  ];

  for (const s of settingsData) {
    await prisma.clinicSetting.upsert({
      where: { clinicId_key: { clinicId: clinic.id, key: s.key } },
      update: {},
      create: { clinicId: clinic.id, key: s.key, value: s.value },
    });
  }

  console.log('✅ Clinic settings initialized\n');

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('─'.repeat(60));
  console.log('🎉 Seed complete!\n');
  console.log('Login credentials:');
  console.log(`  PLATFORM_ADMIN │ bobur@posclinic.uz       │ ErBo150893`);
  console.log(`  SUPERADMIN     │ admin@najotshifo.uz      │ admin123`);
  console.log(`  ADMIN          │ manager@najotshifo.uz    │ staff123   │ clinicId: ${clinic.id}`);
  console.log(`  NURSE          │ sardor@najotshifo.uz     │ doctor123  │ clinicId: ${clinic.id}`);
  console.log('─'.repeat(60));
  console.log(`\nClinic code for Electron setup: ${demoTenant.clinicCode}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
