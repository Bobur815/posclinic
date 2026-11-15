---
paths:
  - "src/main/license/**"
  - "src/shared/license.ts"
  - "src/main/ipc/**"
  - "src/renderer/pages/Setup/**"
---

# posgro ⇄ posclinic licensing contract (v1)

posclinic has NO server of its own for clinics. Clinics are `Store` rows with `product = POSCLINIC`
in **posgro** (`C:\Users\user\posgro`, module `src/server/modules/posclinic/`), created and managed
only by the posgro super admin. The till is offline-only; posgro only licenses it. Same pattern as
SavdoChef (`restaurant-app` ⇄ posgro `modules/savdochef`). Change this file and both sides together.

## Plans / features / limits
- Plans: `TRIAL | START | PRO | ENTERPRISE | VIP`. VIP = every feature, all limits `null`
  (unlimited), no price, never expires (`expiresAt/warnFrom/blockAt = null`), super-admin assigned.
- Features: `reports` (reports over more than one day), `multiDoctor` (more than one active doctor),
  `printPrescription`, `debt` (checkout with partial/unpaid amount), upcoming (not built on the
  till yet): `labResults`, `telegramBot`. Unknown names from the server are ignored by the till.
- Limits (`null` = unlimited): `terminals` (seats), `staff` (active users), `monthlyVisits`
  (appointments created per calendar month).
- Defaults (editable by super admin in SiteConfig `posclinic_config`):
  | plan | terminals | staff | monthlyVisits | features |
  |---|---|---|---|---|
  | TRIAL (14 d) | 1 | null | null | all |
  | START | 1 | 3 | 300 | — |
  | PRO | 2 | 10 | 2000 | reports, multiDoctor, printPrescription, debt |
  | ENTERPRISE | 5 | null | null | all |
  | VIP | null | null | null | all |

## Token
`base64url(JSON payload bytes) + "." + base64url(Ed25519 signature over those bytes)`.
Private key: posgro env `POSCLINIC_LICENSE_SIGNING_KEY` (base64 PKCS8 DER). Public key (base64 SPKI
DER) compiled into the till: `src/main/license/license-public-key.ts`.

```ts
interface PosclinicLicensePayload {
  v: 1;
  product: 'POSCLINIC';
  storeId: string;
  storeName: string;
  plan: string | null;
  expiresAt: string | null;   // ISO; null = perpetual
  warnFrom: string | null;
  blockAt: string | null;
  issuedAt: string;
  checkinBy: string;          // issuedAt + offlineCheckinDays
  terminals?: number;         // omitted = unlimited
  seats?: string[];           // terminal ids holding a seat; omitted = unlimited
  features: string[];
  limits: { staff: number | null; monthlyVisits: number | null };
  trialEndsAt?: string;
}
```

## Endpoints (posgro, prefix `/api/posclinic`, public ones rate-limited)
- `GET  /posclinic/plans` → `{ trial:{enabled,days}, checkinDays, plans:[{id,label,price,period,assignedOnly,terminals,staff,monthlyVisits,features}], supportPhone }`
- `POST /posclinic/activate` `{ phone, activationCode, terminal:{ id, appVersion?, machineName? } }`
  → grant `{ storeId, storeName, ownerName: string|null, license }`
- `POST /posclinic/licenses/renew` `{ license, terminal }` → same grant
- Errors: Nest HttpException with `message` = i18n key, e.g. `posclinic.errors.invalid_code`,
  `posclinic.errors.store_inactive`, `posclinic.errors.no_seat`, `posclinic.errors.disabled`.
- Phone format everywhere: `+998XXXXXXXXX` (server normalizes too).
- Admin (SUPER_ADMIN): `GET/PUT /posclinic/admin/config`, `POST /posclinic/admin/stores/:id/activation-code`
  (8 chars `XXXX-XXXX`, shown once, bcrypt-hashed, 7 days, one-shot), `GET/DELETE /posclinic/admin/stores/:id/terminals[/:terminalId]`.

No self-signup, no OTP, no phone verification (owner decision 2026-11-15). Password recovery: none
yet; Telegram login planned.
