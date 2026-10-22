import os
import openpyxl, glob, csv, sys
BORO = {'New York':('Manhattan',1),'Bronx':('Bronx',2),'Kings':('Brooklyn',3),'Queens':('Queens',4),'Richmond':('Staten Island',5)}
P = ['DEM','REP','CON','WOR','OTH','BLANK','TOTAL']
out, county = [], {}
for f in sorted(glob.glob(sys.argv[1]+'/*.xlsx')):
    ws = openpyxl.load_workbook(f, read_only=True).worksheets[0]
    asof = None
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if i == 1: asof = r[0]
        if i < 6 or not any(r): continue
        c = r[0].strip(); st = r[2].strip().lower()
        vals = [int(v or 0) for v in r[3:10]]
        if c.endswith('County Total'):
            county[(c.replace(' County Total',''), st)] = vals; continue
        name, code = r[1].strip().rsplit(' ', 1)
        out.append(dict(county=name, borough=BORO[name][0], boro_code=BORO[name][1], elect_dist=int(code), ad=int(code[:2]), ed=int(code[2:]), status=st, **dict(zip(P, vals))))
print(asof, len(out))
# validate
import collections
for (c, st), tot in county.items():
    s = [sum(o[p] for o in out if o['county']==c and o['status']==st) for p in P]
    print(c, st, 'OK' if s==tot else ('MISMATCH', s, tot))
for o in out:
    assert sum(o[p] for p in P[:-1]) == o['TOTAL'], o
# per ED: active+inactive == total
eds = collections.defaultdict(dict)
for o in out: eds[(o['county'],o['elect_dist'])][o['status']] = o
bad = [k for k,v in eds.items() if 'total' not in v or [v.get('active',{}).get(p,0)+v.get('inactive',{}).get(p,0) for p in P] != [v['total'][p] for p in P]]
print('EDs', len(eds), 'bad', bad[:10])
dup = collections.Counter(k[1] for k in eds); print('dup ED codes across counties', [k for k,n in dup.items() if n>1][:5])
os.makedirs('data', exist_ok=True)
with open('data/enrollment_long.csv','w',newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(out[0])); w.writeheader(); w.writerows(out)
