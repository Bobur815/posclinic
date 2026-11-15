# GAPS, conflicts and exclusions: admin-units.json

Retrieved 2026-11-15. Sources:
- **A (primary):** MHOBT/SOATO classifier XLSX, https://stat.uz/img/news/soato-20_04_2022_p90343.xlsx. It is linked from https://stat.uz/uz/interaktiv-xizmatlar/statistik-klassifikasiyalar and is annex 1 to State Statistics Committee order No. 59 of 22.07.2020. The file is dated 20.04.2022 and was the only version linked at retrieval.
- **B (cross-check):** SIAT (siat.stat.uz) indicator "Permanent population (total)", https://api.siat.stat.uz/media/uploads/sdmx/sdmx_data_246.json, last modified 2026-11-12. Its rows are keyed by MHOBT code and carry uz, uzc, ru and en names.
- **C (cross-check):** SIAT "Districts" count by region (sdmx_data_307.json, modified 2026-06-12) and "Cities" (sdmx_data_290.json).

## Code format (confirmed from A)
`17` is the Republic. Level 1 codes are 4 digits (17RR). Level 2 codes are 7 digits (17RR + 3). In the last 3 digits, `2xx` is a district, `4xx` is a city of regional (or republic) subordination, and `26x` is a district of Tashkent City. Group-header rows (`…200`, `…400`, `1726260`) are aggregates and were excluded. Codes of 10 digits are settlements, rural assemblies, cities of district subordination and districts of cities, and are out of scope. In every unit the first 4 digits of the code equal the parent code.

## Verification result
- A (2022) and B (Nov 2026) contain **exactly the same 206 level-2 codes**, with no additions and no removals. Every code is therefore confirmed by two official files from the Statistics Agency, including the 2026 state.
- For each region, the district count in A matches C for 2024, 2025 and 2026, except Namangan (see below).

## Recent changes you listed, and how each was checked
| Item | Status |
|---|---|
| Yangihayot district (Tashkent City) | Included: 1726292, in A and B |
| Yangiobod district (Jizzakh) | Included: 1708237, in A and B |
| "Yangiobod" in Tashkent City | **Not found** in A or B. Not included |
| Nurafshon city (Tashkent region) | Included: 1727401, in A and B |
| Tuproqqal'a district (Khorezm) | Included: 1733221, in A and B |
| Davlatobod district (Namangan) | **Excluded.** In A it is a *district of Namangan city* (1714401365), alongside Yangi Namangan district (1714401367). These are not districts of the region, and the scope covers only Tashkent City's districts. They explain why C counts 13 districts for Namangan while we have 11 (+2), and why C's national total is 177 while we have 175 (+2). |

## Conflicts between A and B (resolved in favour of A, the classifier)
- **City names:** A uses the bare name ("Andijon" / "Андижан"). B adds "shahri" / "Город …". A's form is kept.
- **Spelling:** A has "Pskent tumani", B has "Piskent tumani". A is kept.
- **Corrupted text in B:** B's Russian and Cyrillic names contain Latin homoglyphs (e.g. "Улугноpский", "Заpафшан", "Чиpчик", and "Aндижон вилояти" with a Latin A) and doubled spaces. A was clean, so B's uz/ru names were not used.
- **Spelling kept exactly as A has it** (it may differ from common usage): "Shaxrixon tumani" (also written Shahrixon), "Xazorasp tumani", and "Navoiy … shaharlarii" (a typo in a group-header row, which is excluded anyway). The apostrophe characters are kept as A has them: U+2018 ‘ in o‘/g‘, and U+2019 ’ in Tuproqqal’a.

## nameEn
- A has no English names. nameEn comes **only from B**, the same agency's SIAT portal. It was not machine-translated, and it is present for all 220 units.
- Mechanical clean-ups were applied and logged in `admin-units.json.normalization.log`: doubled spaces collapsed (6), a Cyrillic "а" inside "Jalаquduk district" replaced (1), and the missing space in "Khanabadcity" restored (1).
- nameEn has only one source, so it is less verified than the other name fields. It also uses mixed transliteration conventions (e.g. "Jalaquduk" next to "Altynkul").

## Remaining gaps
- No later edition of the classifier than 20.04.2022 is published on stat.uz. Currency to 2026 rests on the matching code set in B.
- data.gov.uz / data.egov.uz: the search endpoint returned HTTP 500, and no SOATO dataset was found there.
- lex.uz: the approving order (No. 59, 22.07.2020) is an internal order of the Committee. It was not found on lex.uz, so there was no legal-text cross-check.
- No supplementary sources (Wikipedia, GitHub) were used. Every code rests on A and B.
