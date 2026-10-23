"""Check ED-level results against the BOE's certified Statement and Return (Recap) files, AD by AD."""
import csv, glob, os, re, sys, pandas as pd
ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
num = lambda s: int(str(s).replace(',', '') or 0)
def recaps():
    rows = []
    for f in glob.glob(f'{ROOT}/raw/results/*/*Recap.csv'):
        for r in csv.reader(open(f, encoding='utf-8-sig', errors='replace')):
            if len(r) < 16: continue
            rows.append((os.path.basename(f).replace(' Recap.csv', ''), r[3], r[4], num(r[5]), r[7], r[11], r[13], r[15]))
    return pd.DataFrame(rows, columns=['stem', 'scope', 'unit', 't', 'total_ballots', 'total_applicable', 'total_votes', 'unrecorded'])
def edlevel():
    rows = []
    for f in glob.glob(f'{ROOT}/raw/results/*/*EDLevel.csv'):
        stem = os.path.basename(f).replace(' EDLevel.csv', '')
        for r in csv.reader(open(f, newline='', encoding='utf-8-sig', errors='replace')):
            v = r[11:]; rows.append((stem, int(v[0]), int(v[1]), v[3], v[9], num(v[10])))
    return pd.DataFrame(rows, columns=['stem', 'AD', 'ED', 'Status', 'Unit', 'Tally'])
COUNTERS = ['Public Counter', 'Manually Counted Emergency', 'Absentee / Military', 'Affidavit', 'Federal']
def validate():
    rc, E = recaps(), edlevel()
    problems, checks = [], 0
    for stem, g in E.groupby('stem'):
        r = rc[rc.stem == stem]
        if r.empty: problems.append((stem, 'no certified recap')); continue
        adr = r[r.scope.str.match(r'^Assembly District \d+$')].copy()
        if adr.empty: problems.append((stem, 'recap has no AD breakdown')); continue
        adr['AD'] = adr.scope.str.extract(r'(\d+)')[0].astype(int)
        edsum = g.groupby(['AD', 'Unit']).Tally.sum()
        for (ad, unit), t in adr.groupby(['AD', 'unit']).t.sum().items():
            if 'Write-In' in unit: continue
            checks += 1
            if edsum.get((ad, unit), 0) != t: problems.append((stem, ad, unit, int(edsum.get((ad, unit), 0)), int(t)))
        for ad, rr in adr.groupby('AD'):
            checks += 2
            wi = rr[rr.unit.str.contains('Write-In')].t.sum(); sc = edsum.get((ad, 'Scattered'), 0)
            if wi != sc: problems.append((stem, ad, 'Scattered vs write-ins', int(sc), int(wi)))
            tb = num(rr.total_ballots.iloc[0]); s = sum(edsum.get((ad, c), 0) for c in COUNTERS)
            if tb != s: problems.append((stem, ad, 'Total Ballots', int(s), int(tb)))
        # ADs in ED files must all appear in the recap
        missing = set(g.AD) - set(adr.AD)
        if missing and g[g.AD.isin(missing)].Tally.sum() > 0: problems.append((stem, 'ADs with votes missing from recap', sorted(missing)))
    return checks, problems, len(E.stem.unique())
if __name__ == '__main__':
    checks, problems, n = validate()
    print(f'{n} contest files, {checks:,} AD-level comparisons, {len(problems)} problems')
    for p in problems[:30]: print(p)
