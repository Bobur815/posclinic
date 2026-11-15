import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xlsx_read import read
sys.stdout.reconfigure(encoding='utf-8')
xlsx, siatj = sys.argv[1], sys.argv[2]
cls = {}
for r in read(xlsx)['SOATO']:
    c = (r[0] or '').strip() if r else ''
    if c.isdigit() and len(c) == 7 and c[4:] not in ('200', '400', '260'):
        cls[c] = r
d = json.load(open(siatj, encoding='utf-8'))[0]['data']
siat = {str(x['Code']): x for x in d if len(str(x['Code'])) == 7}
print('classifier L2:', len(cls), 'siat L2:', len(siat))
for c in sorted(set(cls) - set(siat)): print('ONLY CLS', c, cls[c][1], cls[c][5])
for c in sorted(set(siat) - set(cls)): x = siat[c]; print('ONLY SIAT', c, x['Klassifikator'], '|', x.get('Klassifikator_uzc'), '|', x['Klassifikator_ru'], '|', x.get('Klassifikator_en'))
# name diffs
import unicodedata
for c in sorted(set(siat) & set(cls)):
    x = siat[c]
    if x['Klassifikator_ru'].strip() != (cls[c][5] or '').strip() or x['Klassifikator'].strip() != (cls[c][1] or '').strip():
        print('DIFF', c, repr(cls[c][1]), repr(x['Klassifikator']), '|', cls[c][5], '/', x['Klassifikator_ru'])
others = [x for x in d if len(str(x['Code'])) != 7]
for x in others: print('L1', x['Code'], x['Klassifikator'], '|', x['Klassifikator_ru'], '|', x.get('Klassifikator_en'), '|', x.get('Klassifikator_uzc'))
