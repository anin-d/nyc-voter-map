"""Political donations by donor ZIP code.

City races (NYC Campaign Finance Board, 2025 election cycle): monetary contributions (schedule ABC) net of refunds
(schedule M), to candidates for Mayor, Public Advocate, Comptroller, Borough President and City Council.
Federal (FEC bulk individual contributions, 2025-2026 cycle, file of Oct 18, 2026): contributions as the receiving
committee reports them (types 10, 15, 15C, 15E), less refunds (20Y, 22Y), without memo entries. Earmarked gifts made
through ActBlue or WinRed count once, under the committee that received them; the conduits' pass-through records
(24T) are left out so nothing is counted twice. The FEC lists a donor only after they give a committee more than $200
in the cycle, so smaller gifts are not in these totals.
ZIP areas are the city health department's modified ZCTAs (MODZCTA), which group a few small ZIP codes.
Outputs: site/data/donations.json, site/data/zips.topo.json, data/donations/*.csv
"""
import os, re, json, subprocess
import numpy as np, pandas as pd, geopandas as gpd

ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); SITE = os.environ.get('SITE_DIR', f'{ROOT}/site')
OUT = f'{ROOT}/data/donations'; os.makedirs(OUT, exist_ok=True)
OFFICE = {'1': 'Mayor', '2': 'Public Advocate', '3': 'Comptroller', '4': 'Borough President', '5': 'City Council'}
FEC_H = 'CMTE_ID|AMNDT_IND|RPT_TP|TRANSACTION_PGI|IMAGE_NUM|TRANSACTION_TP|ENTITY_TP|NAME|CITY|STATE|ZIP_CODE|EMPLOYER|OCCUPATION|TRANSACTION_DT|TRANSACTION_AMT|OTHER_ID|TRAN_ID|FILE_NUM|MEMO_CD|MEMO_TEXT|SUB_ID'.split('|')
CM_H = ['CMTE_ID', 'CMTE_NM', 'TRES_NM', 'CMTE_ST1', 'CMTE_ST2', 'CMTE_CITY', 'CMTE_ST', 'CMTE_ZIP', 'CMTE_DSGN', 'CMTE_TP', 'CMTE_PTY_AFFILIATION', 'CMTE_FILING_FREQ', 'ORG_TP', 'CONNECTED_ORG_NM', 'CAND_ID']
CN_H = ['CAND_ID', 'CAND_NAME', 'CAND_PTY_AFFILIATION', 'CAND_ELECTION_YR', 'CAND_OFFICE_ST', 'CAND_OFFICE', 'CAND_OFFICE_DISTRICT', 'CAND_ICI', 'CAND_STATUS', 'CAND_PCC', 'CAND_ST1', 'CAND_ST2', 'CAND_CITY', 'CAND_ST', 'CAND_ZIP']
KIND = {'H': 'House candidates', 'S': 'Senate candidates', 'P': 'Presidential candidates', 'X': 'Parties', 'Y': 'Parties', 'Z': 'Parties',
        'O': 'Super PACs', 'U': 'Super PACs', 'V': 'Super PACs', 'W': 'Super PACs', 'N': 'PACs', 'Q': 'PACs'}
PARTY = {'DEM': 'Democratic', 'REP': 'Republican', 'DFL': 'Democratic'}

ACR = {'DCCC', 'DSCC', 'DNC', 'RNC', 'NRCC', 'NRSC', 'PAC', 'NY', 'NYC', 'USA', 'US', 'AFL', 'CIO', 'SEIU', 'AFSCME', 'UFT', 'LLC', 'II', 'III', 'MAGA', 'AIPAC', 'UAW', 'IBEW', 'NEA', 'AFT', 'HVP', 'WFP', 'DGA', 'RGA', 'DLCC', 'RSLC', 'NARAL', 'EMILY\'S', 'EMILYS', 'GOP', 'J', 'JD'}
def smart_title(s):
    s = re.sub(r'\s+', ' ', str(s)).strip()
    return ' '.join(w if w.upper() in ACR or (len(w) <= 4 and not re.search(r'[AEIOUY]', w.upper())) else w.capitalize() if not any(ch in w for ch in '/-') else '-'.join(x.capitalize() for x in w.split('-')) for w in s.split(' '))
def person(s):
    m = re.match(r'^([^,]+),\s*(.+)$', str(s))
    s = f'{m.group(2)} {m.group(1)}' if m else str(s)
    s = re.sub(r'\b(MR|MRS|MS|DR|HON)\.?\b', '', s.upper())
    return ' '.join(w.capitalize() for w in s.split())

def zip_areas():
    g = gpd.read_file(f'{ROOT}/raw/zip/modzcta.geojson')
    g = g[g.modzcta != '99999'].copy()
    zmap = {}
    for r in g.itertuples():
        for z in re.findall(r'\d{5}', f'{r.label},{r.zcta},{r.modzcta}'): zmap.setdefault(z, r.modzcta)
    return g, zmap

def main():
    g, zmap = zip_areas()
    # ---- city races
    c = pd.read_csv(f'{ROOT}/raw/cfb/2025_Contributions.csv', low_memory=False, encoding='latin1')
    c = c[c.SCHEDULE.isin(['ABC', 'M']) & c.OFFICECD.astype(str).isin(OFFICE)].copy()
    c['zip5'] = c.ZIP.astype(str).str.extract(r'^(\d{5})')[0]
    c['area'] = c.zip5.map(zmap)
    c['office'] = c.OFFICECD.astype(str).map(OFFICE)
    c['recip'] = c.RECIPNAME.str.replace(r'^([^,]+),\s*(.+)$', lambda m: f'{m.group(2)} {m.group(1)}', regex=True)
    c['who'] = c.NAME.fillna('').str.upper().str.strip() + '|' + c.zip5.fillna('')
    city_total = c.AMNT.sum()
    cz = c.dropna(subset=['area'])
    print('CFB net total', round(city_total), 'from NYC ZIPs', round(cz.AMNT.sum()), f'({cz.AMNT.sum() / city_total * 100:.1f}%)')
    # ---- federal
    f = pd.read_csv(f'{ROOT}/raw/fec/ny_nyc_itcont.txt', sep='|', names=FEC_H, dtype=str, quoting=3)
    f['amt'] = pd.to_numeric(f.TRANSACTION_AMT)
    f = f[(f.MEMO_CD != 'X') & f.ENTITY_TP.isin(['IND', 'CAN'])]
    f = f[f.TRANSACTION_TP.isin(['10', '15', '15C', '15E', '20Y', '22Y'])].copy()
    f.loc[f.TRANSACTION_TP.isin(['20Y', '22Y']), 'amt'] *= -1
    f['zip5'] = f.ZIP_CODE.str[:5]; f['area'] = f.zip5.map(zmap)
    cm = pd.read_csv(f'{ROOT}/raw/fec/cm.txt', sep='|', names=CM_H, dtype=str, quoting=3).set_index('CMTE_ID')
    cn = pd.read_csv(f'{ROOT}/raw/fec/cn.txt', sep='|', names=CN_H, dtype=str, quoting=3).set_index('CAND_ID')
    f['cmte'] = f.CMTE_ID.map(cm.CMTE_NM).fillna(f.CMTE_ID)
    f['tp'] = f.CMTE_ID.map(cm.CMTE_TP)
    f['kind'] = f.tp.map(KIND).fillna('Other committees')
    cand = f.CMTE_ID.map(cm.CAND_ID)
    f['party'] = cand.map(cn.CAND_PTY_AFFILIATION).fillna(f.CMTE_ID.map(cm.CMTE_PTY_AFFILIATION)).map(PARTY).fillna('Other or none')
    nm = cand.map(cn.CAND_NAME)
    f['recip'] = np.where(nm.notna(), nm.fillna('').map(person) + ' (' + f.kind.str.replace(' candidates', '') + ')', f.cmte.map(smart_title))
    f['who'] = f.NAME.fillna('').str.upper().str.strip() + '|' + f.zip5
    fz = f.dropna(subset=['area'])
    print('FEC net from NYC ZIPs', round(fz.amt.sum()), 'records', len(fz))
    # ---- per ZIP area
    out = {}
    for a, grp in cz.groupby('area'):
        top = grp.groupby('recip').AMNT.sum().sort_values(ascending=False).head(8)
        out.setdefault(a, {})['cfb'] = {'total': round(float(grp.AMNT.sum()), 2), 'n': int((grp.SCHEDULE == 'ABC').sum()), 'donors': int(grp[grp.SCHEDULE == 'ABC'].who.nunique()),
                                        'small': round(float(grp[(grp.SCHEDULE == 'ABC') & (grp.AMNT <= 250)].AMNT.sum()), 2),
                                        'by_office': {k: round(float(v), 2) for k, v in grp.groupby('office').AMNT.sum().sort_values(ascending=False).items()},
                                        'top': [[k, round(float(v), 2)] for k, v in top.items()]}
    for a, grp in fz.groupby('area'):
        top = grp.groupby('recip').amt.sum().sort_values(ascending=False).head(8)
        out.setdefault(a, {})['fec'] = {'total': round(float(grp.amt.sum()), 2), 'n': int((grp.amt > 0).sum()), 'donors': int(grp[grp.amt > 0].who.nunique()),
                                        'by_kind': {k: round(float(v), 2) for k, v in grp.groupby('kind').amt.sum().sort_values(ascending=False).items()},
                                        'by_party': {k: round(float(v), 2) for k, v in grp.groupby('party').amt.sum().sort_values(ascending=False).items()},
                                        'top': [[k, round(float(v), 2)] for k, v in top.items()]}
    # checks: areas add to the citywide totals
    assert abs(sum(v.get('cfb', {}).get('total', 0) for v in out.values()) - cz.AMNT.sum()) < 1
    assert abs(sum(v.get('fec', {}).get('total', 0) for v in out.values()) - fz.amt.sum()) < 1
    pop = dict(zip(g.modzcta, pd.to_numeric(g.pop_est, errors='coerce')))
    rows = []
    for a, v in sorted(out.items()):
        rows.append({'zip_area': a, 'zips': g.set_index('modzcta').label.get(a, a), 'population_est': pop.get(a),
                     'city_races_total': v.get('cfb', {}).get('total', 0), 'city_races_contributions': v.get('cfb', {}).get('n', 0), 'city_races_donors': v.get('cfb', {}).get('donors', 0),
                     'federal_total': v.get('fec', {}).get('total', 0), 'federal_contributions': v.get('fec', {}).get('n', 0), 'federal_donors': v.get('fec', {}).get('donors', 0)})
    pd.DataFrame(rows).to_csv(f'{OUT}/donations_by_zip.csv', index=False)
    cz[['area', 'zip5', 'recip', 'office', 'SCHEDULE', 'AMNT', 'DATE']].to_csv(f'{OUT}/cfb_2025_by_zip_detail.csv', index=False)
    json.dump({'areas': out, 'pop': pop, 'labels': dict(zip(g.modzcta, g.label)),
               'cfb': {'label': '2025 city elections (Mayor, Public Advocate, Comptroller, Borough President, City Council)', 'total_nyc_zips': round(float(cz.AMNT.sum())),
                       'share_from_nyc_zips': round(float(cz.AMNT.sum() / city_total * 100), 1), 'source': 'NYC Campaign Finance Board, 2025 contributions'},
               'fec': {'label': 'Federal committees, 2025-2026 cycle (itemized gifts over $200)', 'total_nyc_zips': round(float(fz.amt.sum())),
                       'source': 'Federal Election Commission bulk individual contributions, file of Oct 18, 2026'}},
              open(f'{SITE}/data/donations.json', 'w'), separators=(',', ':'), ensure_ascii=False)
    # ZIP shapes and label points for the map
    src = f'{OUT}/modzcta.geojson'; g[['modzcta', 'label', 'geometry']].to_file(src, driver='GeoJSON')
    subprocess.run(f'npx mapshaper -i {src} name=zip -clean -simplify 25% keep-shapes -o {SITE}/data/zips.topo.json format=topojson quantization=1e5',
                   shell=True, check=True, capture_output=True, cwd=ROOT)
    gp = g.to_crs(2263); lp = gpd.GeoSeries(gp.geometry.representative_point(), crs=2263).to_crs(4326)
    lab = json.load(open(f'{SITE}/data/labels.json')); lab['zip'] = {z: [round(p.y, 5), round(p.x, 5)] for z, p in zip(g.modzcta, lp)}
    json.dump(lab, open(f'{SITE}/data/labels.json', 'w'), separators=(',', ':'))
    print('ZIP areas', len(out), 'of', len(g))

if __name__ == '__main__':
    main()
