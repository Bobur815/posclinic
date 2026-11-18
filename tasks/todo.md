# Plan — Stock, expenses and the clinic's money report (v2.10.0)

**Status: approved 2026-11-18 with the recommended answers, except Q7: stock, expenses and the
money report also go to the web dashboard (clinic totals, no split between owners). In progress.**

Previous plan (A4 treatment sheet, v2.9.0) is implemented but **not committed**; it is kept
unchanged at the end of this file.

## Goal

The 3 people who run the clinic want exact figures: what came in, what went out, what it cost.
Everything the clinic buys is tracked in and out:

- **Products for sale**: drugs and ointments sold to patients (today: `DIRECT_SALE` services)
- **Treatment supplies**: used in procedures (enema kits, syringes, solutions…)
- **Household**: toilet paper, tissues, cleaning products…

On top of stock: other expenses (rent, salaries, utilities…) and one **money report** for any
period (income, cost of what was sold or used, expenses, profit, cash flow, stock value).

## Explored (patterns to follow)

| Area | File | What is there / pattern |
|---|---|---|
| Sold products today | `prisma/schema.sqlite.prisma` `Service.kind = DIRECT_SALE`; `register-order.ts:266,313` | A product is a service line on a visit. No stock, no cost price |
| Payment | `appointment-handlers.ts` `appointments:checkout` | One transaction: `Payment` row in the open shift. When the visit is fully PAID, DIRECT_SALE lines go `DONE` → **the place a sale leaves stock** |
| Cancelling | `appointments:update` status CANCELLED | Only unpaid visits with nothing done → no stock has moved yet. There are no refunds of paid visits today |
| Treatment use | `lab-handlers.ts` `sessions:tick` (+ undo), `care-handlers.ts` queue finish (line DONE) | The places a procedure's supplies would be used |
| Cash drawer | `src/main/clinic/shifts.ts`, `shift-handlers.ts`; models `Shift`, `CashMovement` (PAY_IN / PAY_OUT, never edited, a mistake = opposite movement) | Money paid out of the drawer must be a `PAY_OUT` of the open shift so the drawer still adds up. `amountOf()` / `money()` for amounts |
| Payments | model `Payment` (method CASH / CARD / TRANSFER / INSURANCE, shift) | Income on a cash basis comes from these rows (visits paid before v2.6 have none) |
| Reports today | `pages/Reports/DailyReport.tsx` ← `appointments:getAll` | Visits only, no costs |
| Licence | `license-core.ts`: `READONLY_REFUSED`, `appointments:getAll` case | A report over more than one day needs the `reports` feature. Read-only mode refuses new business |
| Data refresh | `ipc-safe.ts` `writtenEntities` + `useDataVersion` | A new entity `stock` / `finance` must be announced so pages refresh |
| Cloud sync | `src/main/sync/sync-engine.ts` `PUSH_ORDER` + `.claude/rules/server-api.md` | Only the listed entities go up. New tables are till-only unless the server is changed too |
| Roles | `ipc-safe.ts` `requireAdmin`, `requireReception`, `isAdmin` | Allow-list helpers |
| SQLite upgrade | `src/main/database/schema.ts` `*IfNeeded` (same as `case_recommendations`) | Additive, idempotent, in place |
| Pages / nav | `src/renderer/App.tsx` routes, `components/layout/Sidebar.tsx` | New routes + sidebar items |
| Service editor | `pages/Services/ServiceList.tsx` | Where a product link and a supply list per service go |

## Proposed design (each choice is a question at the end; the plan uses the recommended answer)

### Data model (5 new tables, nothing changed in existing ones except optional links)

```prisma
/// Anything the clinic buys and keeps (v2.10). qtyOnHand and avgCost are kept by stock.ts only.
model Product {
  id         String   @id @default(cuid())
  name       String
  /// SALE | TREATMENT | HOUSEHOLD (what it is mostly for; reports group by it)
  category   String   @default("HOUSEHOLD")
  /// piece, pack, ml, g… (free text, shown next to quantities)
  unit       String   @default("dona")
  barcode    String?
  /// Warn when on hand drops to this or below; null = no warning.
  minQty     Decimal? @map("min_qty")
  qtyOnHand  Decimal  @default(0) @map("qty_on_hand")
  /// Weighted average cost of one unit (so'm), recomputed on every stock receipt.
  avgCost    Decimal  @default(0) @map("avg_cost")
  /// The DIRECT_SALE service that sells it (1 unit per line unit); null = not sold.
  serviceId  String?  @unique @map("service_id")
  active     Boolean  @default(true)
  …timestamps
}

/// What one unit of a procedure uses (e.g. "Huqna" = 1 kit + 200 ml solution).
model ServiceSupply { id, serviceId, productId, qty Decimal; @@unique([serviceId, productId]) }

/// A delivery from a supplier: its lines are IN movements. Paid from the drawer = a PAY_OUT.
model StockReceipt {
  id, number (unique, e.g. "K-000123"), supplier String?, docNo String?, receivedAt,
  total Decimal, paidFrom String  // DRAWER | OUTSIDE
  cashMovementId String? @unique, note, createdById, createdAt, voidedAt?, voidedById?
}

/// Every change of stock. Never edited or deleted: a mistake is the opposite movement.
model StockMovement {
  id, productId,
  /// IN | SALE | TREATMENT | HOUSEHOLD | ADJUST (stocktake) | VOID (undoes a receipt)
  type String,
  qty Decimal,          // signed: + in, - out
  unitCost Decimal,     // the purchase price (IN) or the average cost at that moment (out)
  receiptId?, itemId? (visit line: SALE / TREATMENT), sessionId?, note,
  createdById?, createdAt
  @@index([productId, createdAt]) @@index([type, createdAt])
}

/// Money spent that is not stock: rent, salaries, utilities, repairs, taxes, other.
model Expense {
  id, category String,  // RENT | SALARY | UTILITIES | REPAIR | TAX | OTHER
  amount Decimal, spentAt DateTime, note,
  paidFrom String,      // DRAWER | OUTSIDE
  cashMovementId String? @unique,
  createdById, createdAt, voidedAt?, voidedById?
}
```

Quantities are decimals (3 places: ml, g). Money to the tiyin like `shifts.ts`.

### How stock moves

| Event | Movement | Where |
|---|---|---|
| Delivery received | `IN` +qty at its price; average cost recomputed | `stock:receive` |
| Visit fully paid, a DIRECT_SALE line with a linked product | `SALE` −qty at average cost | inside `appointments:checkout` transaction |
| Procedure session ticked / non-course procedure line done | `TREATMENT` −(supply qty) for each supply of the service | `sessions:tick`, queue finish; undo of a tick = opposite movement |
| Household / other use, broken, expired | `HOUSEHOLD` −qty (manual write-off with a note) | `stock:writeOff` |
| Stocktake (counted ≠ on hand) | `ADJUST` ± difference | `stock:count` |
| Delivery entered by mistake | `VOID` opposite of its lines (+ opposite cash movement if it was paid from the drawer) | `stock:voidReceipt` |

Out of stock: the sale or treatment still goes through (stock goes negative, page shows it red);
reception is never blocked from taking money (Q6).

### Money report (`finance:report`, from / to)

- **Income**: payments taken in the period by method (cash, card, transfer, insurance) +
  unpaid balance (debt) of visits in the period.
- **Cost of goods sold**: SALE movements × their unit cost.
- **Supplies used**: TREATMENT + HOUSEHOLD movements × unit cost (by product category).
- **Stocktake differences**: ADJUST × cost.
- **Expenses** by category.
- **Profit** = income − cost of goods sold − supplies used − stocktake loss − expenses.
- **Cash flow** (what actually left the clinic): deliveries paid + expenses paid, split
  drawer / outside.
- **Stock value** now (Σ on hand × average cost) and low-stock list.
- Breakdown per service kind (consultation / analysis / procedure / sale) for income.

## Steps

### 1. SQLite (skill `prisma-migration`)
- [x] `prisma/schema.sqlite.prisma`: the 5 models; relations on `Service`, `User`, `CashMovement`, `AppointmentItem`, `TreatmentSession` (relation fields only, no new columns in old tables)
- [x] `src/main/database/schema.ts`: `addStockIfNeeded` (CREATE TABLE / INDEX IF NOT EXISTS) on both paths
- [x] `npm run prisma:generate:sqlite`, `prisma validate`, model count +5 (CRLF lesson)
- [x] `schema-upgrade.test.ts`: old DB gains the tables; a second run changes nothing
- [x] `migration-reviewer` agent

### 2. Main
- [x] `src/main/clinic/stock.ts` (pure, takes `tx`, like `shifts.ts`): `receive`, `consume(type, productId, qty, link)`, `adjustTo(counted)`, `voidReceipt`, average cost math, quantity / amount validation
- [x] `src/main/clinic/finance.ts`: the report queries (Prisma, not raw SQL: lesson 2026-11-15)
- [x] `src/main/ipc/stock-handlers.ts`: `stock:listProducts`, `stock:saveProduct`, `stock:receive`, `stock:listReceipts`, `stock:voidReceipt`, `stock:writeOff`, `stock:count`, `stock:movements` (product history), `stock:setSupplies` (per service)
- [x] `src/main/ipc/finance-handlers.ts`: `expenses:create`, `expenses:list`, `expenses:void`, `finance:report`
- [x] Hooks into existing transactions: `appointments:checkout` (SALE), `sessions:tick` + undo, queue finish (TREATMENT). Same transaction, so money and stock never disagree
- [x] Paid from the drawer: needs the open shift (`requireOpenShiftId`), creates the `PAY_OUT` with a note "Kirim K-000123" / "Xarajat: Ijara"
- [x] Roles (Q7): admin = everything; receptionist = receive deliveries, write-offs, expenses from the drawer; nurse = write-offs; doctor = read stock
- [x] `ipc-safe.ts` `writtenEntities`: `stock:*` → `stock`; `expenses:*` → `finance`, `shifts` when drawer; checkout / tick also announce `stock`
- [x] Logs: ids and kinds only

### 3. Licence (no posgro change)
- [x] `license-core.ts`: `stock:receive`, `stock:saveProduct`, `expenses:create` in `READONLY_REFUSED` (new business). Write-offs, counts and voids stay allowed (records of what happened)
- [x] `finance:report`: same rule as `appointments:getAll`: one day free, longer needs `reports`
- [x] No new plan feature (would change the posgro contract and plans; separate task if wanted)
- Note: the till is no longer "offline-only" for this data: it goes up with the existing cloud
  sync (main till, licence-authenticated), like visits already do.

### 4. Preload + shared types
- [x] `preload.ts`: `stock.*`, `expenses.*`, `finance.report` + types
- [x] `src/shared/stock.ts`: DTOs from the Prisma field names, category lists, `FinanceReportDto`

### 5. Renderer (Styled Components tokens, light + dark)
- [x] **Ombor / Склад** page: products with on hand, unit, average cost, value, low-stock badge; filter by category; product form; history per product
- [x] **Kirim** (delivery) form: supplier, document no., lines (product, qty, price), paid from drawer / outside; list of deliveries with void
- [x] **Hisobdan chiqarish** (write-off) form and **Inventarizatsiya** (stocktake: counted qty per product, shows differences before saving)
- [x] **Xarajatlar** (expenses) page: add, list by period, void
- [x] **Moliya hisoboti** (money report) page: period picker (today / week / month / custom), the blocks above, print on A4 (reuse print engine) optional later
- [x] Service editor: DIRECT_SALE → pick its product; PROCEDURE → supply list (product + qty)
- [x] Checkout / service picker: show "omborda: 3" next to products (no blocking)
- [x] `App.tsx` routes + `Sidebar.tsx` items (by role)

### 6. i18n
- [x] Every string in `ru.json` and `uz.json` (`stock.*`, `expenses.*`, `finance.*`, errors `errors.invalidQuantity`, `errors.productNotFound`…); key parity check

### 7. Version
- [x] `npm version minor --no-git-tag-version` → 2.10.0

### 7b. Web dashboard (Q7: the owners see it from home). Contract `.claude/rules/server-api.md`
- [x] One pure report function `src/shared/finance-report.ts` (rows in → figures out), used by the
  till's `finance:report` **and** the server, so both show the same numbers
- [x] Till sync (`sync-engine.ts`): push `products`, `stockReceipts`, `stockMovements`, `expenses`,
  `payments` (after appointments). Append-only rows (movements, payments) use `createdAt` as the
  cursor (payments have no `updatedAt`; the wire sends `updatedAt = createdAt`). Up only, never pulled
- [x] Postgres `prisma/schema.prisma`: the same 5 tables with `clinicId` + `syncedAt` (supplies per
  service stay on the till). Migration `20261118100000_stock_finance`, additive, made with
  `prisma migrate diff` (no database needed) and read before saving. The user runs `migrate deploy`
- [x] Server sync: `SYNC_ENTITIES`, parsers (bad row = reject, not the batch), `SyncPushDto` arrays
  (+ `sync.dto.test.ts`), `PrismaSyncDb` find / write; reject `missing_product`,
  `missing_appointment`
- [x] Server API (admins, read-only): `GET /api/stock/products`, `GET /api/stock/movements`,
  `GET /api/expenses`, `GET /api/reports/finance?from=&to=` (clinic time UTC+5)
- [x] Web pages: Stock (on hand, value, low stock, history), Expenses, Money report; nav; uz + ru
- [x] Contract file updated (payments now go up; the new rows and endpoints)
- [x] Server tests: apply of the new rows (reject foreign / missing), finance endpoint figures

### 8. Tests and checks
- [x] `stock.test.ts` (real test DB): receipt → average cost (e.g. 10 × 1 000 + 10 × 1 400 → 1 200); sale at checkout only when fully PAID; a partial payment moves nothing; tick / undo use and return supplies; write-off; stocktake difference; void receipt reverses stock and the drawer; negative stock allowed and shown; roles refused; read-only refusals
- [x] `finance.test.ts`: a fixed scenario (2 visits, 1 delivery paid from the drawer, 1 expense outside, 1 write-off) gives exact income, cost, profit, cash flow, stock value; drawer expected cash still matches `shifts:summary`
- [x] Licence gate tests: report range > 1 day without `reports`
- [x] `npm run typecheck`, `npm test`
- [x] `migration-reviewer` + `electron-security-reviewer` agents
- [ ] End to end in the running till (skill `run`): add product, receive delivery from the drawer, sell it, tick a procedure session, write off tissues, add rent, open the report → figures match by hand

## Review (stock, v2.10.0)

**Built**
- Till: 5 tables (`products`, `service_supplies`, `stock_receipts`, `stock_movements`, `expenses`),
  in place, additive. `src/main/clinic/stock.ts` (weighted average cost, one `move()` for every
  quantity change, drawer cash-outs in the same transaction, `settleItemStock` idempotent per
  line / session so retries and undo never double-count) and `finance.ts`.
- Hooks: checkout when fully paid (SALE), free direct sale at registration, `sessions:tick` +
  undo, `results:save`, `queue:finish` (TREATMENT by the service's supply list).
- Pages: Ombor (products, deliveries with void, write-off, stocktake, supply lists per service,
  history), Xarajatlar, Moliya hisoboti (admins); on-hand shown on sale cards at registration.
  The product form can make its DIRECT_SALE service (Q1).
- Web: products, movements, expenses and payments sync up (payments for the first time); server
  tables + migration `20261118100000_stock_finance`; read-only endpoints; 3 web pages. The money
  report is one pure function (`src/shared/stock.ts`) on both sides.

**Differences from the plan**
- Handlers in one file `stock-handlers.ts` (no separate finance-handlers); report function in
  `src/shared/stock.ts` (not finance-report.ts); one test file `stock.test.ts` covers the
  finance scenario too.
- Supply lists are edited on the stock page ("Muolaja sarflari" tab), not in the service editor.
- Stock quantity errors use the new key `errors.invalidStockQty` (the existing
  `invalidQuantity` text says "service quantity").

**Verified**
- `npm run typecheck`, server `tsc`, web `tsc` + `vite build`, `electron-vite build`, `nest build`.
- `npm test` 276/276 (new: stock end to end with every report figure worked out by hand and the
  drawer re-checked; licence gate; read-only refusals; sync push of the new entities; server
  apply / reject of the new rows; DTO whitelist).
- `migration-reviewer`: safe to ship (till and Postgres).
- `electron-security-reviewer`: no high findings. Fixed:
  - stock movements and payments are kept on the server even before their product / visit
    arrives (a sale during a sync run was rejected and lost for good); plain ids, read back only
    within the clinic; the migration has no product foreign key;
  - drawer expenses are dated now; only an admin dates an "outside" one, never in the future;
  - reception lists only drawer expenses, and receives deliveries from the drawer only;
  - `expenses:list` over more than one day needs `reports`; lists and reports cap at 366 days;
  - a repeated submit (page id) saves a delivery / expense once; pages block double clicks;
  - a stocktake refuses the same product twice; the product's service check is in the transaction.
  - Not changed: `products.serviceId` / `stockMovements.receiptId` stay unchecked plain ids on the
    server (no read path joins on them).

**Not done / for the owner**
- End to end in the running till (not run in this session).
- The server's container applies the new migration on start (`scripts/deploy/lib.sh`), so deploy
  the server before or with the till. A till on v2.10 talking to an older server keeps the new
  rows queued (cursor stays) and sends them once the server takes them.

**v2.10.1: simpler product form (owner found "Sotuv xizmati" confusing)**
- The sale part shows only for category SALE and asks just for the sale price. Saving a new one
  makes its DIRECT_SALE service; editing a linked one sets that service's price.
- "Link to an existing service" is a secondary button and lists only services no other product
  uses. Main: `salePrice` replaces `createServicePrice`; `serviceId` left out keeps the link; other
  categories never get a service. Tests: price update, kept link, HOUSEHOLD ignores both.

## Open questions (plan assumes the recommended answer)

1. Products for sale: link each to its existing DIRECT_SALE service (price stays on the service, stock on the product)? (recommended: yes; a product page creates the service for you if missing)
2. When does a sold product leave stock: when the visit is fully paid? (recommended: yes, same moment the line becomes DONE; partly paid = still in stock)
3. Treatment supplies: deducted automatically by a per-procedure supply list when a session is ticked, plus manual write-off for anything else? (recommended: yes, both)
4. Cost method: weighted average cost, no batches or expiry dates? (recommended: average now; batches with expiry date = later task)
5. Other expenses (rent, salaries, utilities…) in the same task, each marked "paid from the drawer" (cash-out in the shift) or "paid outside" (bank, owner's pocket)? (recommended: yes, both)
6. Selling or using more than is on hand: allow it (stock goes negative, shown in red) rather than block reception? (recommended: allow)
7. Should stock, expenses and the money report also reach the web dashboard, so the owners see them from home? (recommended: not in this task, till only; the server sync is a separate task. Also say if the profit must be split between the 3 owners by shares; the plan shows clinic totals only)

Roles assumed (say if different): admin everything; reception receives deliveries, writes off, adds
expenses from the drawer; nurse writes off; doctor only sees stock.

---

# Previous plan (kept as it was)

## Plan — A4 prescription: course checklist + doctor's recommendations (v2.9.0)

Previous plan (web dashboard + satellite tills, v2.1) is done and committed; its review is in git history.

**Status: implemented 2026-11-18 (approved with the recommended answers). Not committed. One check open: see Review.**

## Decisions

- (owner, 2026-11-18) Recommendations belong to the **whole course** (`ClinicalCase`). New ones
  can be added on later visits; earlier ones stay.
- The final A4 layout comes later from Claude Design. This plan covers the data, the doctor's
  input and the print plumbing, with a plain A4 layout that the design will replace.
- Open questions are at the end. The plan below uses the **recommended** answer for each one.

## Explored (patterns to follow)

| Area | File | Pattern |
|---|---|---|
| Case handlers | `src/main/ipc/care-handlers.ts` | `handle()`; `requireCaseClinician` (lead doctor, a doctor with a line in the case, or an admin); `text()` trim + cap; `randomUUID()` ids; `cases:get` include |
| SQLite bootstrap | `src/main/database/schema.ts` | `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` list (idempotent, in place, same as `treatment_sessions`) |
| Prisma model | `prisma/schema.sqlite.prisma` | `ClinicalCase` relations; `TreatmentSession` (number, plannedDate, doneAt) already exists |
| Print | `src/main/ipc/print-handlers.ts` | `PRINTABLE_APPOINTMENT_INCLUDE` → `toPrintableVisit` → `buildPrescriptionHTML`; refuses when there is no diagnosis or prescription |
| Print types + HTML | `src/shared/receipt-html.ts` | `PrintSourceAppointment` → `PrintableVisit`; `a4Styles()`, `escapeHtml`, `LABELS` ru/uz, `sampleVisit` |
| Satellite print | `src/main/ipc/dispatch.ts` `satellitePrint` | the visit comes from main's `appointments:getById`, so that call must carry the new data too |
| `getById` | `src/main/ipc/appointment-handlers.ts` | its own include (patient, doctor, items, payments) |
| Licence | `src/main/ipc/dispatch.ts`, `license-core.ts` | `printPrescription` feature already gates `print:prescription` on main and satellite. **No licence, plan or posgro change.** |
| Cloud sync | `src/main/sync/sync-engine.ts` `PUSH_ORDER` | only listed entities go up. A new table is till-only unless it is added here **and** on the server (Q6) |
| Doctor UI | `src/renderer/pages/Care/CasePage.tsx` | complaint/diagnosis editor (`cases.update`), referrals form (`cases.addReferral`) |
| Print button | `src/renderer/pages/Appointments/AppointmentDetails.tsx` | `print.prescription(id)` via `usePrint` |
| Preload | `src/main/preload.ts` `cases:` namespace (line 144) + types (line 393) |

## Data model

New table, append-only list per case:

```prisma
/// The doctor's advice for home: diet, home procedures, other. Belongs to the course (case);
/// new ones are added on later visits, old ones stay (removed = active false).
model CaseRecommendation {
  id        String       @id @default(cuid())
  caseId    String       @map("case_id")
  case      ClinicalCase @relation(fields: [caseId], references: [id])
  doctorId  String?      @map("doctor_id")
  doctor    Doctor?      @relation(fields: [doctorId], references: [id])
  /// DIET | HOME | OTHER
  category  String       @default("OTHER")
  text      String
  active    Boolean      @default(true)
  createdBy String?      @map("created_by")
  createdAt DateTime     @default(now()) @map("created_at")
  updatedAt DateTime     @updatedAt @map("updated_at")

  @@index([caseId, active])
  @@map("case_recommendations")
}
```

## Steps

### 1. SQLite (skill `prisma-migration`)
- [x] `prisma/schema.sqlite.prisma`: model above + `recommendations CaseRecommendation[]` on `ClinicalCase` and `Doctor`
- [x] `src/main/database/schema.ts`: `CREATE TABLE IF NOT EXISTS case_recommendations (…)` + index `idx_recommendations_case`. Additive and idempotent: existing tills upgrade in place on start
- [x] `npm run prisma:generate:sqlite`, `prisma validate`; check that the model count went up by exactly one (CRLF lesson)
- [x] `schema-upgrade.test.ts`: an old DB without the table gets it; a second run changes nothing
- [x] Run the `migration-reviewer` agent

### 2. Main / IPC (`care-handlers.ts`)
- [x] `cases:addRecommendation(caseId, { category, text })`: `requireCaseClinician`; case must not be CLOSED; category in the list; text trimmed, 1–2000 chars
- [x] `cases:removeRecommendation(id)`: sets `active = false`. Only its author or an admin
- [x] `cases:get` includes active recommendations (oldest first) with the doctor's name
- [x] Nothing is logged except ids (medical data)

### 3. Print plumbing
- [x] `receipt-html.ts`: `PrintSourceAppointment` gets an optional `case`: `{ recommendations[], courses[] }`. A course = one course line of the case (service name, total sessions, sessions `{ number, plannedDate, doneAt }`)
- [x] `PrintableVisit` gets `courses` and `recommendations` (grouped DIET / HOME / OTHER); `toPrintableVisit` maps them
- [x] One shared include `PRESCRIPTION_CASE_INCLUDE` (case → recommendations + every course line in the case with its sessions), used by both `print-handlers.ts` and `appointments:getById`, so a satellite prints the same sheet
- [x] `printPrescription`: print when there is a diagnosis, a prescription, a course **or** a recommendation (today it needs one of the first two)
- [x] `buildPrescriptionHTML` A4: "Treatment course" section (per course: `3 / 10`, a box per session: ✔ + date done, or an empty box + planned date) and "Recommendations" section. Roll (80/58 mm): course as one `3 / 10` line, recommendations as text, no grid
- [x] `sampleVisit` gets a sample course and sample recommendations (Settings preview)
- [x] Final layout: port the Claude Design HTML here once the owner sends it (separate step)

### 4. Preload + renderer
- [x] `preload.ts`: `cases.addRecommendation`, `cases.removeRecommendation` + types
- [x] Shared type in `src/shared/clinic.ts` (field names from the Prisma model, lesson 2026-11-15)
- [x] `CasePage.tsx`: "Recommendations" panel under the diagnosis: list grouped by category (date, doctor), a category selector, a text area, Add, and Remove on your own entries. Hidden for roles that cannot write (main enforces)
- [x] Styled Components theme tokens, light + dark

### 5. i18n (ru + uz, both)
- [x] Renderer: `cases.recommendations.*` (title, categories, add, remove, empty, placeholder) and errors (`errors.invalidRecommendation`)
- [x] Print `LABELS` in `receipt-html.ts`: course, sessions done, planned, recommendations, diet, home, other

### 6. Version
- [x] `npm version minor --no-git-tag-version` → 2.9.0 (new feature)

### 7. Tests and checks
- [x] `care.test.ts`: add as lead doctor / admin; refused for another doctor, for reception, on a CLOSED case, for an empty text or unknown category; remove by author / admin only; `cases:get` returns only active ones
- [x] `printing.test.ts`: prescription HTML holds the course boxes (done ✔ + date, planned empty) and the recommendations, escaped (`<script>` in text); prints with recommendations only; `appointments:getById` carries the case data (satellite path)
- [x] `npm run typecheck`, `npm test` (`npm run lint` fails before this change: no `eslint.config.js` for ESLint 9)
- [ ] End to end in the real app (skill `run`): open case → add 2 recommendations → register a course → tick 3 sessions → print prescription to "Microsoft Print to PDF" on A4 → check the PDF
- [x] `electron-security-reviewer` agent on the IPC + print changes

## Open questions (plan assumes the recommended answer)

1. Who adds recommendations: doctors on the case and admins, like the diagnosis? (recommended: yes; nurses and reception read only)
2. Can a saved recommendation be removed or edited? (recommended: author or admin can remove, no editing; to change it, remove and add a new one)
3. Category per entry (Diet / At home / Other) or free text only? (recommended: category, so the sheet can show diet in its own block)
4. Saved templates (e.g. "antiparasitic diet") now or later? (recommended: later, separate task)
5. Which course lines go on the sheet: every course in the case, or only this visit's order? (recommended: every course in the case)
6. Should recommendations go up to the cloud server / web dashboard? (recommended: not now, till-only; server change is a separate task)
7. Print from the case page too, not only from a visit? (recommended: not now; the visit page button prints the whole case anyway)

## Review

**Done (v2.9.0)**
- Table `case_recommendations` (additive, idempotent, till only). Categories follow the design:
  `DIET_ALLOWED | DIET_AVOID | HOME` (not DIET/HOME/OTHER as first planned).
- `cases:addRecommendation` / `cases:removeRecommendation`: doctors on the case + admins; removal
  by author or admin (soft); closed case refused; max 50 active per case; not read-only-refused
  (a clinical note, like `cases:update`).
- A4 prescription = the treatment sheet from `docs/design/…Variant A — rasmiy blank.html`:
  sections numbered by content (I medicines = the free-text prescription, II course grid with
  10 boxes per row, III diet table + home points), next-visit line, signature, stamp, footer.
  Roll prescription: course `done / total` lines + advice points.
- One include (`PRINTABLE_APPOINTMENT_INCLUDE.case`) feeds both the main till and satellites.
- (owner, 2026-11-18) The sheet is handed over once, when the doctor assigns the course; the
  nurse ticks it by hand. So a course comes from the doctor's course referral
  (`src/shared/course.ts` `caseCourses`): all its boxes are there from the referral on (empty
  until reception registers it), registered sessions fill them in order (also over several
  orders), a cancelled referral leaves the sheet. The case page draws the same 10-per-row grid
  under each course referral (✓ + done date, planned date, dashed = not registered yet).
- Review fixes: `appointments:getById` now requires a signed-in user; an admin's advice is not
  credited to the lead doctor; unknown categories are not printed.

**Verified**
- `npm run typecheck` clean; `npm test` 262/262 (new: handler roles/limits, sheet HTML, mapping,
  Russian age words, upgrade test lists the table).
- Sample sheets (uz + ru) rendered in headless Edge at A4 width and compared with the design.
- `migration-reviewer`: safe to ship. `electron-security-reviewer`: no high findings; mediums fixed.

**Not done / follow-ups**
- End to end in the running till (case page panel + a real print to PDF): not run in this session.
- Medicines are still free text; the design's structured table (dose / times / days) needs its
  own data model. Saved advice templates: later (Q4).
- `appointments:getAll` / `getTodaySummary` also lack a signed-in check (older code, not touched).
