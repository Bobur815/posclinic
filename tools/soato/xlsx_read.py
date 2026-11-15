"""Minimal stdlib XLSX reader: yields rows (list of str) per sheet."""
import zipfile, re, sys, json
import xml.etree.ElementTree as ET
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
def col_idx(ref):
    letters = re.match(r'([A-Z]+)', ref).group(1)
    n = 0
    for ch in letters: n = n*26 + ord(ch)-64
    return n-1
def read(path):
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS):
            shared.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    relmap = {r.get('Id'): r.get('Target') for r in rels}
    out = {}
    for sh in wb.find('m:sheets', NS):
        rid = sh.get('{%s}id' % NS['r'])
        tgt = relmap[rid].lstrip('/')
        if not tgt.startswith('xl/'): tgt = 'xl/' + tgt
        root = ET.fromstring(z.read(tgt))
        rows = []
        for row in root.iter('{%s}row' % NS['m']):
            vals = {}
            for c in row.findall('m:c', NS):
                t = c.get('t'); v = c.find('m:v', NS)
                if t == 's' and v is not None: val = shared[int(v.text)]
                elif t == 'inlineStr':
                    val = ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m']))
                else: val = v.text if v is not None else None
                vals[col_idx(c.get('r'))] = val
            if vals:
                rows.append([vals.get(i) for i in range(max(vals)+1)])
        out[sh.get('name')] = rows
    return out
if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    d = read(sys.argv[1]); n = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    for name, rows in d.items():
        print('SHEET', name, len(rows))
        for r in rows[:n]: print(r)
