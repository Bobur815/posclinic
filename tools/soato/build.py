import json, sys, os, re, datetime
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xlsx_read import read
sys.stdout.reconfigure(encoding='utf-8')
xlsx, siatj, outp = sys.argv[1], sys.argv[2], sys.argv[3]
LAT2CYR = str.maketrans('ABCEHKMOPTXaceopxy', 'АВСЕНКМОРТХасеорху')
CYR2LAT = str.maketrans('АВСЕНКМОРТХасеорху', 'ABCEHKMOPTXaceopxy')
log = []
def clean(s): return re.sub(r'\s+', ' ', (s or '')).strip()
def has_cyr(s): return bool(re.search(r'[Ѐ-ӿ]', s))
def has_lat(s): return bool(re.search(r'[A-Za-z]', s))
def fix_script(code, field, s, want):
    if want == 'cyr' and has_lat(s):
        n = s.translate(LAT2CYR)
        log.append(f'{code} {field}: Latin homoglyphs in Cyrillic text normalized {s!r} -> {n!r}'); s = n
    if want == 'lat' and has_cyr(s):
        n = s.translate(CYR2LAT)
        log.append(f'{code} {field}: Cyrillic homoglyphs in Latin text normalized {s!r} -> {n!r}'); s = n
    return s
rows = read(xlsx)['SOATO']
units = []
siat = {str(x['Code']): x for x in json.load(open(siatj, encoding='utf-8'))[0]['data']}
for r in rows:
    c = (r[0] or '').strip() if r else ''
    if not c.isdigit(): continue
    if len(c) == 4: parent, lvl = None, 1
    elif len(c) == 7 and c[4:] not in ('200', '400', '260'): parent, lvl = c[:4], 2
    else: continue
    if lvl == 1: typ = {'1735': 'REPUBLIC', '1726': 'CITY'}.get(c, 'REGION')
    else: typ = 'CITY' if c[4] == '4' else 'DISTRICT'
    nameUz = fix_script(c, 'nameUz', clean(r[1]), 'lat')
    nameUzCyrl = fix_script(c, 'nameUzCyrl', clean(r[3]), 'cyr')
    nameRu = fix_script(c, 'nameRu', clean(r[5]), 'cyr')
    en = None
    if c in siat and siat[c].get('Klassifikator_en'):
        raw = siat[c]['Klassifikator_en']; en = clean(raw)
        en = fix_script(c, 'nameEn', en, 'lat')
        n = re.sub(r'(?<=[a-z])(city|district)$', r' \1', en)
        if n != en: log.append(f'{c} nameEn: missing space restored {en!r} -> {n!r}'); en = n
        if clean(raw) != raw: log.append(f'{c} nameEn: whitespace normalized {raw!r} -> {en!r}')
    else:
        log.append(f'{c} nameEn: not present in siat source -> null')
    units.append({'code': c, 'parentCode': parent, 'type': typ, 'nameUz': nameUz,
                  'nameUzCyrl': nameUzCyrl, 'nameRu': nameRu, 'nameEn': en})
out = {
  'source': [
    {'name': 'Statistics Agency of Uzbekistan - MHOBT/SOATO departmental classifier (XLSX), annex 1 to State Statistics Committee order No. 59 of 22 July 2020',
     'url': 'https://stat.uz/img/news/soato-20_04_2022_p90343.xlsx',
     'listedOn': 'https://stat.uz/uz/interaktiv-xizmatlar/statistik-klassifikasiyalar',
     'retrievedAt': '2026-11-15', 'version': 'file dated 20.04.2022 (latest version linked on stat.uz as of retrieval)',
     'usedFor': 'codes, hierarchy, nameUz, nameUzCyrl, nameRu'},
    {'name': 'Statistics Agency SIAT portal - indicator 2.0x "Permanent population (total)" (sdmx_data_246.json), regional/district breakdown keyed by MHOBT code',
     'url': 'https://api.siat.stat.uz/media/uploads/sdmx/sdmx_data_246.json',
     'retrievedAt': '2026-11-15', 'version': 'last modified 2026-11-12',
     'usedFor': 'cross-check of current code set (2026); nameEn'},
    {'name': 'SIAT portal - indicators "Districts" (307) and "Cities" (290) counts by region',
     'url': 'https://api.siat.stat.uz/media/uploads/sdmx/sdmx_data_307.json',
     'retrievedAt': '2026-11-15', 'version': 'last modified 2026-06-12', 'usedFor': 'cross-check of district counts per region'},
  ],
  'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
  'units': units,
}
json.dump(out, open(outp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
open(outp + '.normalization.log', 'w', encoding='utf-8').write('\n'.join(log) + '\n')
print('units', len(units)); print('\n'.join(log))
