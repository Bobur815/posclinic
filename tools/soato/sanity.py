import json, sys, re, collections
sys.stdout.reconfigure(encoding='utf-8')
d = json.load(open(sys.argv[1], encoding='utf-8')); siat307 = json.load(open(sys.argv[2], encoding='utf-8'))[0]['data']
U = d['units']; ok = True
def chk(name, cond, detail=''):
    global ok; ok &= bool(cond); print(('PASS' if cond else 'FAIL'), name, detail)
L1 = [u for u in U if u['parentCode'] is None]; L2 = [u for u in U if u['parentCode']]
l1codes = {u['code'] for u in L1}
chk('exactly 14 level-1 units', len(L1) == 14, len(L1))
chk('level-1 codes are 4 digits', all(re.fullmatch(r'17\d\d', u['code']) for u in L1))
chk('level-2 codes are 7 digits', all(re.fullmatch(r'\d{7}', u['code']) for u in L2))
codes = [u['code'] for u in U]
chk('no duplicate codes', len(codes) == len(set(codes)), len(codes))
chk('every parentCode exists at level 1', all(u['parentCode'] in l1codes for u in L2))
chk('code prefix == parentCode', all(u['code'][:4] == u['parentCode'] for u in L2))
chk('no empty nameUz/nameUzCyrl/nameRu', all(u[k] and u[k].strip() for u in U for k in ('nameUz','nameUzCyrl','nameRu')))
chk('nameUz has no Cyrillic', not any(re.search(r'[Ѐ-ӿ]', u['nameUz']) for u in U))
chk('nameUzCyrl/nameRu have no Latin letters', not any(re.search(r'[A-Za-z]', u[k]) for u in U for k in ('nameUzCyrl','nameRu')))
chk('types valid', all(u['type'] in ('REPUBLIC','REGION','CITY','DISTRICT') for u in U))
chk('level-1 types: 12 REGION, 1 REPUBLIC, 1 CITY', collections.Counter(u['type'] for u in L1) == {'REGION':12,'REPUBLIC':1,'CITY':1})
print('nameEn null count:', sum(1 for u in U if u['nameEn'] is None))
want = {str(x['Code']): int(x['2026']) for x in siat307 if len(str(x['Code'])) == 4}
print('\nlevel-1 | DISTRICT | CITY | total | SIAT "Districts" 2026')
tot = collections.Counter()
for u in L1:
    c = collections.Counter(x['type'] for x in L2 if x['parentCode'] == u['code'])
    tot.update(c)
    print(f"{u['code']} {u['nameUz']:32} {c['DISTRICT']:3} {c['CITY']:3} {sum(c.values()):3}  {want.get(u['code'])}")
print('TOTAL level-2:', len(L2), dict(tot), '| SIAT total districts 2026:', want.get('1700'))
print('\nALL CHECKS PASSED' if ok else '\nSOME CHECKS FAILED')
