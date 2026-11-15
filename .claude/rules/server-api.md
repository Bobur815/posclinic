---
paths:
  - "src/server/**"
  - "src/web/**"
  - "src/main/sync/**"
  - "prisma/schema.prisma"
---

# posclinic server API contract (v1)

One server (`src/server`, NestJS, Postgres, prefix `/api`) serves two clients:
the **main till** (sync, authenticated by its posgro licence) and the **web dashboard**
(`src/web`, clinic admins, JWT). Change this file and every side together.

Hosting: `clinic.posgro.uz` (prod), `dev.clinic.posgro.uz` (staging), for now on the posgro
Contabo VPS (Germany); it will move to an Uzbekistan VPS. Clinic creation and licensing stay in
posgro. Patient data must never be logged (ids only).

## Identity and conventions
- **Clinic id = posgro `storeId`** from the licence. Every row carries `clinicId`; every query is
  scoped by the clinic from the JWT or the licence, **never** from the request body.
- Ids are UUIDs created on the till (or on the server for web-created catalog rows). Upserts by id.
- Phone `+998XXXXXXXXX` (`src/shared/phone.ts` `normalizePhone`); email optional.
- Money: JSON numbers (UZS). Dates: ISO strings.
- Till roles: `CLINIC_ADMIN | SUPER_ADMIN | DOCTOR | RECEPTIONIST`. Web login: `CLINIC_ADMIN`, `SUPER_ADMIN` only.
- Soft delete only (`active: false`).
- Errors: Nest HttpException, `message` = i18n key `server.errors.<code>` (or class-validator array).

## Row shapes (what sync carries; field names = the till's Prisma SQLite model, camelCase)
```ts
Patient     { id, patientCode, fullName, phone, birthDate|null, gender|null, bloodType|null, allergies|null,
              address|null, city|null, notes|null, active, createdAt, updatedAt }
Doctor      { id, fullName, phone|null, specialty|null, licenseNo|null, active, createdAt, updatedAt }
Service     { id, code, name, description|null, price, duration, active, createdAt, updatedAt }
User        { id, fullName, phone, email|null, role, active, passwordHash, createdAt, updatedAt }
Appointment { id, appointmentNumber, patientId, doctorId, appointmentDate, status, totalAmount, paidAmount,
              paymentStatus, paymentMethod|null, diagnosis|null, prescription|null, notes|null,
              terminalId|null, createdAt, updatedAt,
              items: [{ id, serviceId, serviceName, quantity, unitPrice, total }] }
```

## Sync (main till → server). Auth: licence
Headers: `Authorization: License <posgro licence token>`, `X-Terminal-Id: <terminalId>`,
`X-App-Version: <version>`. `LicenseGuard` verifies the Ed25519 signature with
`POSCLINIC_LICENSE_PUBLIC_KEY` (the same key compiled into the till), requires
`product === 'POSCLINIC'`, refuses `blockAt <= now` (`server.errors.license_blocked`, 403) and a
bad or foreign token (`server.errors.invalid_license`, 401). The clinic row is created or renamed
from `storeId`/`storeName`, and its plan and expiry are copied from the licence.

- `POST /api/sync/push` body `{ patients?: Patient[], doctors?: Doctor[], services?: Service[],
  users?: User[], appointments?: Appointment[] }`. Each array has at most 200 rows. One transaction per call.
  - **Last write wins:** a row is written only if it is new or `incoming.updatedAt > stored.updatedAt`.
  - Appointment items are replaced as a set with their appointment.
  - Apply order: users, doctors, services, patients, appointments.
  - Idempotent: sending the same batch twice changes nothing.
  - Answer: `{ accepted: { patients, doctors, services, users, appointments }, rejected: [{ entity, id, reason }], serverTime }`.
  - A rejected row (for example, a user phone already used by another user id in this clinic) does not fail the batch.
- `GET /api/sync/pull?since=<ISO|empty>` returns `{ doctors: Doctor[], services: Service[], users: User[], serverTime }`.
  - It returns rows whose server-side change time (`syncedAt`, set by the server on every write, push or web) is greater than `since`, including inactive rows.
  - The till stores `serverTime` as its next `since` and applies rows with the same last-write-wins rule.
- Every authenticated sync call upserts `TerminalHeartbeat(clinicId, terminalId)` (`lastSyncAt`, app version).

### Sync details (as implemented, 2026-11-15)
- **LicenseGuard order:**
  - invalid/foreign token → 401 `invalid_license`;
  - `blockAt` passed → 403 `license_blocked`;
  - `checkinBy` passed → 403 `license_checkin_required`.
- **`accepted`** counts every row not rejected, including rows skipped because the server already has the same or a newer version. The till always advances its cursor.
- **Reject reasons:** `invalid`, `foreign_id` (the id belongs to another clinic), `phone_invalid`, `phone_taken`, `role_invalid`, `code_taken`, `missing_patient`, `missing_doctor`, `missing_service`.
  - `passwordHash` must be bcrypt.
  - An array over 200 rows fails the whole call with 400 `batch_too_large`.
- **Pull:** `serverTime` = now − 5 s, so rows may come twice. Last-write-wins makes that harmless.
- **Heartbeat:** without `X-Terminal-Id` it is recorded as `unknown`.

## Dashboard (web). Auth: JWT `{ sub, clinicId, role }`, 12 h
As implemented:
- The guard reloads the user on every request. A deactivated or demoted admin, or a clinic past `blockAt`, gets 403 at once.
- Lists answer `{items, total}`, `pageSize` ≤ 100. Appointment lists include `patient` and `doctor` stubs. `PUT` is a partial update.
- Money terms:
  - dashboard `revenue` = paid;
  - report `totals.revenue` = billed, with `paid` and `debt` given separately;
  - cancelled visits count only as cancelled;
  - days and months are in clinic time (UTC+5).
- Extra error codes: `unauthorized`, `not_found`, `wrong_password`, `self_demote`, `invalid_date`. Phone and code conflicts → 409.
- `POST /api/auth/login { phone, password }` returns `{ token, user: { id, fullName, phone, email, role }, clinic: { id, name, plan, expiresAt } }`.
  - Refused: unknown or wrong password (`invalid_credentials`, 401), not an admin role (`not_admin`, 403), inactive user (`user_inactive`, 403), licence blocked (`license_blocked`, 403).
- `GET /api/auth/profile`, `PUT /api/auth/change-password { currentPassword, newPassword }`
- `GET /api/clinic` returns `{ id, name, plan, expiresAt, lastSyncAt, terminals: [{ terminalId, lastSyncAt, appVersion }] }`
- `GET /api/dashboard/summary?date=YYYY-MM-DD` returns `{ visits, completed, cancelled, revenue, debt, newPatients, topServices: [{ name, count, revenue }], topDoctors: [{ name, count, revenue }] }`
- `GET /api/patients?search=&page=&pageSize=` returns `{ items, total }`. `GET /api/patients/:id` returns the patient plus `visits: Appointment[]`.
- `GET /api/appointments?from=&to=&status=&doctorId=&page=&pageSize=` returns `{ items, total }`. `GET /api/appointments/:id`.
- `GET /api/reports/daily?date=` and `GET /api/reports/monthly?month=YYYY-MM` return `{ totals: { visits, revenue, paid, debt }, byDoctor: [], byService: [], byDay?: [] }`.
- Catalog (admins; every write sets `updatedAt = syncedAt = now` and writes an AuditLog row):
  - `GET/POST /api/services`, `PUT /api/services/:id` (deactivate with `active:false`). `code` is unique per clinic.
  - `GET/POST /api/doctors`, `PUT /api/doctors/:id`.
  - `GET/POST /api/users`, `PUT /api/users/:id`, `POST /api/users/:id/reset-password { newPassword }`.
    - Phone is unique per clinic; the server stores the bcrypt hash only.
    - An admin cannot deactivate or demote themself.
- `GET /api/audit-logs?page=&pageSize=` returns `{ items, total }`.
  - Item: `{ id, userId, userName, action, entity, entityId, details, createdAt }`.
  - `details` is a JSON **object or null**, never a string: `{ fields: string[] }` for an update, `{ role }` for a new user. It holds ids and field names only, never patient data. Clients must format it, not render it raw.
