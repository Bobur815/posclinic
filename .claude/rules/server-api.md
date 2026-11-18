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
- Till roles: `CLINIC_ADMIN | SUPER_ADMIN | DOCTOR | RECEPTIONIST | NURSE` (NURSE since v2.5). Web login: `CLINIC_ADMIN`, `SUPER_ADMIN` only.
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

### v2.5 additions (clinical workflow; every new field optional, so a v2.4 till still syncs)
```ts
Patient     + { regionCode|null, districtCode|null, chronicConditions|null }
Service     + { kind: CONSULTATION|ANALYSIS|PROCEDURE (default PROCEDURE), isFollowUp, resultType|null, resultUnit|null, referenceRange|null }
Appointment + { doctorId|null (analysis / procedure orders), caseId|null, discountAmount }
  items[]   + { discount, doctorId|null, referralId|null, status: WAITING|IN_PROGRESS|DONE|CANCELLED, performedBy|null,
                startedAt|null, completedAt|null, sessions: [{ id, number, plannedDate|null, doneAt|null, doneBy|null }] }
Case        { id, caseNumber, patientId, doctorId|null, status, complaint|null, diagnosis|null, openedAt, closedAt|null, createdAt, updatedAt }
Referral    { id, caseId, patientId, doctorId|null, serviceId, quantity, perDay|null, days|null, instructions|null,
              registeredQty, status: PENDING|PARTIAL|REGISTERED|CANCELLED, createdAt, updatedAt }
Vitals      { id, patientId, caseId|null, heightCm|null, weightKg|null, temperature|null, bpSystolic|null, bpDiastolic|null,
              pregnant|null, complaints|null, recordedBy|null, recordedAt, updatedAt }
Result      { id, itemId, caseId|null, patientId, serviceId, outcome: POSITIVE|NEGATIVE|null, value|null, unit|null, finding|null,
              comment|null, sampleTakenAt|null, enteredBy|null, enteredAt|null, confirmedBy|null, confirmedAt|null, createdAt, updatedAt }
```
- Push body arrays `cases, referrals, vitals, results`; apply order users, doctors, services, patients, **cases, referrals**,
  appointments, **vitals, results**. Sessions are replaced as a set with their item (as items with their appointment).
  A line or session change on the till touches its appointment's `updatedAt` so the order is re-sent.
- New reject reason `missing_case`. A null `doctorId` is not checked; a non-null one must be the clinic's.
- Pull services carry the type fields; the web catalog edits them with the till's consistency rules.
- `GET /api/patients/:id` adds `cases: Case[]`, `latestVitals: Vitals|null`, `results: (Result & { serviceName })[]` (read-only).
- **Custom types (v2.5):** push arrays `serviceTypes { id, nameUz, nameRu|null, behavior, color|null, sortOrder, active, createdAt, updatedAt }` and `staffTypes { id, nameUz, nameRu|null, access: NONE|RECEPTIONIST|NURSE|CLINIC_ADMIN, active, createdAt, updatedAt }`, applied first. `Service.serviceTypeId|null`, `User.staffTypeId|null` (plain ids). Kind `DIRECT_SALE` (done at payment, no case); role `STAFF` (no login, no staff seat). `GET /api/types` returns both lists (read-only; made on the till). Migration `20261116100000_custom_types`: additive.
- **Fiscal codes (v2.6):** `Service + { mxik|null (17 digits), packageCode|null (digits) }`, set on the till (tasnif.soliq.uz); a malformed code is stored as null, never a reject. Shown read-only on the web; not in the pull fields (the till owns them). Shifts, payments and fiscal receipt state stay on the till. Migration `20261116200000_service_fiscal_codes`: additive.
- Migration `20261115200000_clinical_workflow`: additive, plus `appointments.doctor_id` made nullable and a data
  backfill of the new item `status` from the visit status.

### v2.10 additions (stock and money; read-only on the web)
```ts
Product       { id, name, category: SALE|TREATMENT|HOUSEHOLD, unit, barcode|null, minQty|null, qtyOnHand (may be < 0),
                avgCost, serviceId|null (plain id), active, createdAt, updatedAt }
StockReceipt  { id, number, supplier|null, docNo|null, receivedAt, total, paidFrom: DRAWER|OUTSIDE, note, createdById|null,
                voidedAt|null, voidedById|null, createdAt, updatedAt }
StockMovement { id, productId, type: IN|SALE|TREATMENT|HOUSEHOLD|ADJUST|VOID, qty (signed: − out), unitCost,
                receiptId|null, itemId|null, sessionId|null, note, createdById|null, createdAt, updatedAt }
Expense       { id, category: RENT|SALARY|UTILITIES|REPAIR|TAX|OTHER, amount, spentAt, note, paidFrom: DRAWER|OUTSIDE,
                createdById|null, voidedAt|null, voidedById|null, createdAt, updatedAt }
Payment       { id, appointmentId, method: CASH|CARD|TRANSFER|INSURANCE, amount, createdById|null, createdAt, updatedAt }
```
- Push arrays `products, stockReceipts, stockMovements, expenses, payments`, applied after `results`.
  Movements and payments (append-only facts) are kept even before their product / visit arrives (a sale made while
  a sync runs): `productId` / `appointmentId` are plain ids, no foreign key, read back only within the clinic.
- **Payments now go up** (before v2.10 they stayed on the till). They are never changed: the till's cursor follows
  `createdAt` and sends `updatedAt = createdAt`. Shifts, cash movements and the drawer links (`cashMovementId`,
  `shiftId`) stay on the till. Supply lists per service (`service_supplies`) stay on the till.
- Up only, never pulled; the web cannot change them.
- `GET /api/stock/products?includeInactive=` → `{ items }`; `GET /api/stock/movements?productId=&from=&to=&page=&pageSize=`
  and `GET /api/expenses?from=&to=&page=&pageSize=` → `{ items, total }`;
  `GET /api/reports/finance?from=YYYY-MM-DD&to=YYYY-MM-DD` (clinic days, both included, ≤ 366 days) →
  `FinanceReportDto` from `src/shared/stock.ts` `buildFinanceReport`, the same function the till's report uses.
- Migration `20261118100000_stock_finance`: additive (new tables only).

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
