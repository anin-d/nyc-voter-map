"""Council discretionary funding, FY2027 (July 2026 to June 2027), from the Council's own expense funding disclosure
workbook (rnd.council.nyc.gov, 'FY27 (09-14-26)'). Each designation is credited to the sponsoring member's district;
Speaker's initiatives and borough delegation designations are kept separate. Totals are checked against the workbook.
Outputs: site/data/funding.json, data/funding/funding_fy2027_by_district.csv, data/funding/funding_fy2027_designations.csv
"""
import os, re, json, unicodedata
import pandas as pd

ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); SITE = os.environ.get('SITE_DIR', f'{ROOT}/site')
OUT = f'{ROOT}/data/funding'; os.makedirs(OUT, exist_ok=True)
SRC = f'{ROOT}/raw/discretionary/funded_disclosure_FY2027.xlsx'
fold = lambda s: unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().strip().lower()

def main():
    d = pd.read_excel(SRC)
    asof = re.search(r'\((\d\d-\d\d-\d\d)\)', pd.ExcelFile(SRC).sheet_names[0]).group(1)
    d['member'] = d['Council Member'].fillna('').astype(str).str.strip()
    reps = json.load(open(f'{SITE}/data/reps.json'))['cc']
    by_last = {}
    for k, v in reps.items():
        by_last.setdefault(fold(v['name'].split()[-1]), []).append(int(k))
    def district(m):
        if not m: return None
        f = fold(m)
        ini = re.match(r'^([a-z])\.\s*(.+)$', f)
        if ini:      # 'P. Sanchez'
            c = [k for k in by_last.get(ini.group(2), []) if fold(reps[str(k)]['name'])[0] == ini.group(1)]
            return c[0] if len(c) == 1 else None
        c = by_last.get(f, [])
        if len(c) == 1: return c[0]
        c = [int(k) for k, v in reps.items() if fold(v['name']).endswith(' ' + f)]      # multi-word surnames
        return c[0] if len(c) == 1 else None
    d['district'] = d.member.map(district)
    d['kind'] = ['district' if pd.notna(x) else 'speaker' if m == 'Speaker' else 'delegation' if 'Delegation' in m else 'citywide'
                 for x, m in zip(d.district, d.member)]
    unmatched = sorted(set(d.member[(d.kind == 'citywide') & (d.member != '')]))
    assert not unmatched, f'members not matched to a district: {unmatched}'
    total = d.Amount.sum()
    assert abs(d.groupby('kind').Amount.sum().sum() - total) < 0.5
    print('FY2027 total', total, d.groupby('kind').Amount.agg(['size', 'sum']).to_dict())
    # every member who designates maps to exactly one district, and every district appears
    assert set(d.district.dropna().astype(int)) == set(range(1, 52)), 'a district has no designations'
    d['program'] = d['Source'].fillna('').str.strip()
    d['category'] = d.program.map(lambda s: s if s in ('Local', 'Youth', 'Aging') else 'Citywide initiatives')
    d['org'] = d['Legal Name'].fillna('').str.strip()
    d['addr'] = (d['Grantee Street Address 1'].fillna('').astype(str).str.strip() + ', ' + d['City'].fillna('').astype(str).str.strip() + ' ' +
                 d['Postal Code'].fillna('').astype(str).str.replace(r'\.0$', '', regex=True)).str.strip(', ')
    keep = ['MOCS ID#', 'member', 'district', 'kind', 'program', 'category', 'org', 'Tax ID', 'Status', 'Amount', 'Agency', 'Program Name', 'addr', 'Purpose of Funds', 'Fiscal Conduit']
    d[keep].to_csv(f'{OUT}/funding_fy2027_designations.csv', index=False)
    dd = d[d.kind == 'district'].copy(); dd['district'] = dd.district.astype(int)
    S = dd.pivot_table(index='district', columns='category', values='Amount', aggfunc='sum').fillna(0)
    S['total'] = S.sum(axis=1); S['designations'] = dd.groupby('district').size(); S['organizations'] = dd.groupby('district')['Tax ID'].nunique()
    S.to_csv(f'{OUT}/funding_fy2027_by_district.csv', index_label='council_district')
    out = {'fy': 2027, 'label': 'Fiscal year 2027 (July 2026 to June 2027)', 'as_of': asof,
           'source': 'NYC Council expense funding disclosure, FY2027', 'source_url': 'https://council.nyc.gov/budget/',
           'total': float(total), 'speaker_total': float(d.Amount[d.kind == 'speaker'].sum()),
           'delegations': {m: float(a) for m, a in d[d.kind == 'delegation'].groupby('member').Amount.sum().items()},
           'citywide_initiatives_total': float(d.Amount[d.kind == 'citywide'].sum()), 'cc': {}}
    for k, g in dd.groupby('district'):
        g = g.sort_values('Amount', ascending=False)
        out['cc'][str(k)] = {'total': float(g.Amount.sum()), 'n': int(len(g)), 'orgs': int(g['Tax ID'].nunique()),
                             'by_category': {c: float(a) for c, a in g.groupby('category').Amount.sum().sort_values(ascending=False).items()},
                             'by_agency': {c: float(a) for c, a in g.groupby('Agency').Amount.sum().sort_values(ascending=False).items()},
                             'rows': [[r.org, float(r.Amount), r.program, r.Agency if isinstance(r.Agency, str) else '', r.Status, r.addr,
                                       (r['Purpose of Funds'] if isinstance(r['Purpose of Funds'], str) else '')[:300]] for _, r in g.iterrows()]}
    json.dump(out, open(f'{SITE}/data/funding.json', 'w'), separators=(',', ':'), ensure_ascii=False)
    print('district totals', S.total.describe().round(0).to_dict())
    print(os.path.getsize(f'{SITE}/data/funding.json'), 'bytes')

if __name__ == '__main__':
    main()
