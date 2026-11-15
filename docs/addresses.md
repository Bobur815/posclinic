# Uzbekistan addresses (till)

Patients get a structured address: **region → district/city** chosen from the official classifier, plus a free-text street/house. Everything is on the till (offline); nothing is fetched from the network at run time.

## Data

- **File:** `src/main/database/data/admin-units.json`. It is bundled with the app and holds 220 units: 14 top-level units (12 regions, the Republic of Karakalpakstan, Tashkent City) and 206 below them (175 districts, 31 cities of regional subordination).
- **Primary source:** the Statistics Agency's MHOBT/SOATO classifier, https://stat.uz/img/news/soato-20_04_2022_p90343.xlsx. The file is dated 20.04.2022 and is linked from https://stat.uz/uz/interaktiv-xizmatlar/statistik-klassifikasiyalar. It gives the codes, the hierarchy, `nameUz`, `nameUzCyrl` and `nameRu`.
- **Cross-check:** SIAT, https://api.siat.stat.uz/media/uploads/sdmx/sdmx_data_246.json, modified 2026-11-12. It has exactly the same 206 level-2 codes, which confirms the list is current. `nameEn` comes only from here.
- **Retrieved:** 2026-11-15.
- **Gaps, conflicts and exclusions:** [addresses/GAPS.md](addresses/GAPS.md). The main points:
  - districts *of cities* (e.g. Davlatobod in Namangan city) and mahallas are out of scope;
  - `nameEn` has a single source;
  - classifier spellings are kept as published.
- **Checks:** [addresses/sanity-report.txt](addresses/sanity-report.txt). Name clean-ups: [addresses/admin-units.json.normalization.log](addresses/admin-units.json.normalization.log).
- No code or unit was invented. Anything not in the official files is left out.

### Codes
`17RR` is a top-level unit and `17RRxxx` is a unit below it. The first 4 digits are always the parent's code. In `xxx`, `2xx` is a district, `4xx` is a city and `26x` is a district of Tashkent City.

## Storage

- Table `admin_units` (`code` PK, `parent_code`, `type`, `level`, `name_uz`, `name_uz_cyrl`, `name_ru`, `name_en`, `active`). It is created in place by `addAddressTablesIfNeeded` in `src/main/database/schema.ts`.
- `patients.region_code` / `patients.district_code` hold the SOATO codes. They are nullable FKs to `admin_units`.
- `patients.city` keeps a derived text, "District, Region" in Uzbek, for the server and web dashboard, which have no dataset. Older patients keep their free-text city until someone picks a region.
- `patients.address` = street / house.

## Import (idempotent)

`importAdminUnits()` (`src/main/database/admin-units.ts`) runs on every DB open, from `upgradeDatabase` in `sqlite-client.ts`:

1. It validates the whole file first: code format, duplicates, empty names, types, parents existing at the top level. An invalid file writes nothing.
2. It skips if `settings.admin_units_version` already equals the dataset hash.
3. Otherwise, in one transaction, it upserts parents then children. Units missing from the new file are set to **`active = false`** and never deleted, so patients that point at them keep their codes. It then stores the version.
4. A failure is logged and does not stop the clinic DB from opening.

## API (IPC, main till; satellites forward)

| Channel | Returns |
|---|---|
| `addresses:regions` | active top-level units, by code |
| `addresses:children(parentCode)` | active children by `nameUz`; `[]` for a district; `errors.invalidAddress` for a bad or unknown code |

`patients:create` / `patients:update` take `regionCode` and `districtCode`, which are checked by `resolveAddress()` in `src/main/ipc/address-handlers.ts`:
- the region must be active and top-level;
- the district must be active and a child of that region;
- a district without a region is refused.

Otherwise the call is refused with `errors.invalidAddress`. When both fields are omitted from an update, the stored address is left unchanged.

## UI

- `AddressSelector` (`src/renderer/components/address/`) is a controlled component with value `{ regionCode, districtCode }`:
  - two dependent selects; the district select is disabled until a region is chosen and is reset when the region changes;
  - loading, empty and error (with retry) states;
  - names follow the app language through `unitName(unit, lang)` in `src/shared/address.ts`, falling back to `nameUz`.
- `AddressText` displays a stored address in the current language.
- Caching is in `src/renderer/hooks/useAdminUnits.ts`. It keeps an in-memory promise cache for the app session and shares in-flight requests. A failed request is dropped so a retry refetches. The data changes only with an app update, so there is nothing to revalidate.

```tsx
<AddressSelector
  value={{ regionCode: form.regionCode, districtCode: form.districtCode }}
  onChange={(v) => setForm((f) => ({ ...f, ...v }))}
/>
```

Example: `src/renderer/pages/Patients/PatientForm.tsx`.

## Updating the dataset

1. Download the current classifier XLSX from the stat.uz page above and the SIAT `sdmx_data_246.json`. Put them in an empty folder outside the repo.
2. Run `python -I tools/soato/build.py <classifier.xlsx> <sdmx_data_246.json> <out>/admin-units.json`.
3. Run `python -I tools/soato/sanity.py <out>/admin-units.json <sdmx_data_307.json>` and `compare.py <xlsx> <sdmx_data_246.json>`. Every check must pass. Read the diff of unit codes.
4. Replace `src/main/database/data/admin-units.json` and update the sources and dates here and in `GAPS.md`.
5. Run `npm test` (`src/main/ipc/address.test.ts`). Then bump the app version.

On the next start each till imports the new version once. Removed units become inactive, and new ones appear.
