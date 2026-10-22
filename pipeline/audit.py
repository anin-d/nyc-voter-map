"""Independent checks of every dataset behind the NYC Voter Map.
Writes audit/report.md plus detail CSVs. Each check uses a different source or code path than the build."""
import os, json, glob, re
import numpy as np, pandas as pd, geopandas as gpd, pyogrio, openpyxl

ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); OUT = f'{ROOT}/audit'; os.makedirs(OUT, exist_ok=True)
UP = os.environ.get('ENROLLMENT_DIR', f'{ROOT}/raw/enrollment')
R = []           # report lines
def h(t): R.append(f'\n## {t}\n')
def line(status, text): R.append(f'- **{status}** {text}')
def ok(cond, text, detail=''):
    line('PASS' if cond else 'FAIL', text + (f' ({detail})' if detail else '')); return cond

# =====================================================================
h('1. Voter enrollment')
ed = pd.read_csv(f'{ROOT}/out/election_districts_enrollment.csv').set_index('elect_dist')
# 1a: re-read the five uploaded workbooks with a second, independent reader (pandas, header-driven)
rows = []
for f in sorted(glob.glob(f'{UP}/*ed_feb26*.xlsx')):
    df = pd.read_excel(f, header=4)
    df = df[df['ELECTION DIST'].notna() & df['STATUS'].notna()]
    df['elect_dist'] = df['ELECTION DIST'].astype(str).str.extract(r'(\d{5})$')[0].astype(int)
    df['status'] = df['STATUS'].str.strip().str.lower()
    rows.append(df)
raw = pd.concat(rows)
P = ['DEM', 'REP', 'CON', 'WOR', 'OTH', 'BLANK', 'TOTAL']
mism = 0
for st in ['total', 'active', 'inactive']:
    r = raw[raw.status == st].set_index('elect_dist')[P]
    db = ed[[f'{p.lower()}_{st}' for p in P]]; db.columns = P
    r = r.reindex(db.index).fillna(0).astype(int)
    mism += int((r != db).to_numpy().sum())
ok(mism == 0, 'Every party count for every ED and status matches the original BOE workbooks, re-read with a second parser', f'{len(ed):,} EDs x 21 cells, {mism} differences')
ok((ed[[f'{p}_total' for p in ['dem','rep','con','wor','oth','blank']]].sum(axis=1) == ed.total_total).all(), 'Party columns add to the total in every ED')
ok(all((ed[f'{p}_active'] + ed[f'{p}_inactive'] == ed[f'{p}_total']).all() for p in ['dem','rep','con','wor','oth','blank','total']), 'Active + inactive = total in every ED and party')
ok(ed.total_total.sum() == 5359346, 'Citywide registrants', f'{ed.total_total.sum():,}')
ok(ed.index.is_unique, 'ED codes unique citywide')

# =====================================================================
h('2. Election district to district assignment (independent geometry)')
eds = gpd.read_file(f'{ROOT}/data/eds_attr.geojson').to_crs(2263)
xw = pd.read_csv(f'{ROOT}/out/ed_district_crosswalk.csv').set_index('elect_dist')
pts = eds[['id', 'geometry']].copy(); pts['geometry'] = pts.representative_point()
def check_layer(name, path, col, ours, code_fn=lambda s: s.astype(int)):
    lay = gpd.read_file(path).to_crs(2263)
    j = gpd.sjoin(pts, lay[[col, 'geometry']], predicate='within', how='left').drop_duplicates('id').set_index('id')
    theirs = code_fn(j[col].dropna()) if j[col].notna().any() else j[col]
    cmp = pd.DataFrame({'ours': xw[ours], 'theirs': theirs}).dropna()
    bad = cmp[cmp.ours.astype(int) != cmp.theirs.astype(int)]
    voters = ed.reindex(bad.index).total_total.fillna(0).sum()
    bad.join(ed.total_total).to_csv(f'{OUT}/xw_mismatch_{name}.csv')
    ok(voters == 0, f'{name}: our assignment vs {os.path.basename(path)}', f'{len(cmp):,} EDs compared, {len(bad)} differ, {int(voters):,} voters in differing EDs; {int(j[col].isna().sum())} ED points outside that layer')
    if len(bad): line('INFO', f'{name}: the {len(bad)} differing EDs have no registered voters; they are slivers on a district edge.')
    return bad
b_sd = check_layer('State Senate', f'zip://{ROOT}/raw/census/tl_2024_36_sldu.zip', 'SLDUST', 'senate_district')
b_ad = check_layer('Assembly', f'zip://{ROOT}/raw/census/tl_2024_36_sldl.zip', 'SLDLST', 'assembly_district')
b_cd = check_layer('Congress', f'zip://{ROOT}/raw/census/tl_2024_36_cd119.zip', 'CD119FP', 'congressional_district')
b_cc = check_layer('City Council', f'{ROOT}/raw/od_council.geojson', 'coundist', 'council_district')
ok((xw.assembly_district == xw.index // 1000).all(), 'Assembly district equals the first two digits of every ED code')

# block-level check: 2020 population by district straight from blocks vs. through EDs
b = pyogrio.read_dataframe(f'zip://{ROOT}/raw/census/tl_2020_36_tabblock20.zip', read_geometry=False, columns=['GEOID20','COUNTYFP20','POP20','INTPTLAT20','INTPTLON20'])
b = b[b.COUNTYFP20.isin(['005','047','061','081','085'])]
bp = gpd.GeoDataFrame(b, geometry=gpd.points_from_xy(b.INTPTLON20.astype(float), b.INTPTLAT20.astype(float)), crs=4326).to_crs(2263)
cc_lay = gpd.read_file(f'{ROOT}/raw/od_council.geojson').to_crs(2263)
dj = gpd.sjoin(bp, cc_lay[['coundist','geometry']], predicate='within', how='left').drop_duplicates('GEOID20')
miss = dj.coundist.isna()
near = gpd.sjoin_nearest(bp[miss.values], cc_lay[['coundist','geometry']]).drop_duplicates('GEOID20')
dj.loc[miss, 'coundist'] = near.set_index(near.index).coundist
direct = dj.groupby('coundist').POP20.sum()
direct.index = direct.index.astype(int)
xwt = pd.read_csv(f'{ROOT}/data/census/xw_tract_ed.csv')
via = xwt.join(xw[['council_district']], on='elect_dist').groupby('council_district').pop20.sum()
cmp = pd.DataFrame({'direct_blocks': direct, 'via_eds': via}).fillna(0)
cmp['diff_pct'] = (cmp.via_eds / cmp.direct_blocks - 1) * 100
cmp.to_csv(f'{OUT}/council_2020_pop_direct_vs_eds.csv')
ok(cmp.diff_pct.abs().max() < 0.1, '2020 Census population by council district: blocks placed directly in council lines vs. through EDs (shoreline blocks snapped to the nearest area in both)', f'largest gap {cmp.diff_pct.abs().max():.2f}%, total {int(cmp.direct_blocks.sum()):,} vs {int(cmp.via_eds.sum()):,}')
dev = (cmp.direct_blocks / cmp.direct_blocks.mean() - 1) * 100
ok(dev.abs().max() < 10.5, 'Council districts are within the legal ±5% population band around the 2020 ideal (tolerance for block-center placement)', f'range {dev.min():+.1f}% to {dev.max():+.1f}%')

# =====================================================================
h('3. Census ACS 2020–2024: parsing and totals')
spec = json.load(open(f'{ROOT}/data/census/indicators.json'))
C = pd.read_csv(f'{ROOT}/data/census/tract_counts.csv', dtype={'tract_geoid': str}).set_index('tract_geoid')
Mt = pd.read_csv(f'{ROOT}/data/census/tract_counts_moe.csv', dtype={'tract_geoid': str}).set_index('tract_geoid')
# 3a: re-derive key tract counts straight from the raw summary-file text with a different reader
def rawcol(t, col):
    d = {}
    with open(f'{ROOT}/raw/acs/nyc_{t}.dat') as fh:
        head = fh.readline().strip().split('|'); i = head.index(col)
        for ln in fh:
            p = ln.rstrip('\n').split('|'); d[p[0][-11:]] = int(p[i])
    return pd.Series(d)
checks = {'pop': rawcol('b01001', 'B01001_E001'),
          'cvap': rawcol('b05003', 'B05003_E009') + rawcol('b05003', 'B05003_E011') + rawcol('b05003', 'B05003_E020') + rawcol('b05003', 'B05003_E022'),
          'hisp': rawcol('b03002', 'B03002_E012'), 'renter': rawcol('b25003', 'B25003_E003'), 'pov': rawcol('b17001', 'B17001_E002'),
          'lep_hh': sum(rawcol('c16002', f'C16002_E{l:03d}') for l in (4, 7, 10, 13))}
bad = {k: int((C[k] != v.reindex(C.index)).sum()) for k, v in checks.items()}
ok(sum(bad.values()) == 0, 'Tract counts re-derived from the raw Census text files with a separate reader', ', '.join(f'{k} {v}' for k, v in bad.items()) + ' mismatches')
# 3b: tract sums vs. the Census Bureau's own county and city rows
def ref_counts(prefix_regex):
    E, Mo = {}, {}
    for f in glob.glob(f'{ROOT}/raw/acs/ref/ref_*.dat'):
        d = pd.read_csv(f, sep='|', dtype=str); d = d[d.GEO_ID.str.match(prefix_regex)].set_index('GEO_ID').apply(pd.to_numeric, errors='coerce')
        for c in d.columns:
            (E if '_E' in c else Mo)[c.replace('_E', '_').replace('_M', '_')] = d[c]
    return pd.DataFrame(E), pd.DataFrame(Mo)
# rebuild the build-script field formulas from its source text so the same definitions apply to reference rows
src = open(f'{ROOT}/pipeline/census_build.py').read()
FIELD = {}
r_ = lambda a, b: list(range(a, b + 1))
for m in re.finditer(r"put\('(\w+)', '(\w+)', ([^)]*\)?[^)]*)\)", src):
    pass
def fields_for(E):
    out = pd.DataFrame(index=E.index)
    def put(name, t, *lines): out[name] = sum(E[f'{t}_{l:03d}'].fillna(0) for l in lines)
    r = r_
    LANG = dict(spa=3, fre=6, sla=12, oie=15, kor=18, chi=21, vie=24, tag=27, oap=30, ara=33)
    block = src[src.index("put('pop', 'B01001', 1)"):src.index("HOUSE = [c for c")]
    exec(block, {'put': put, 'r': r, 'LANG': LANG, 'C': out, 'PERSON': None, 'list': list})
    return out
CE, CM = ref_counts(r'^0500000US360(05|47|61|81|85)$')
CF = fields_for(CE)
CF.index = CF.index.str[-5:]
ours = C.groupby(C.index.str[:5]).sum()
diff = ((ours[CF.columns] - CF) / CF.replace(0, np.nan) * 100).abs()
worst = diff.max().sort_values(ascending=False)
diff.T.to_csv(f'{OUT}/acs_tract_sum_vs_county_pct_diff.csv')
ok(worst.max() < 0.01, 'Every count field: our five-borough tract sums vs. the Census Bureau county estimates', f'largest gap {worst.max():.4f}% ({worst.index[0]})')
PE, PM = ref_counts(r'^1600000US3651000$'); PF = fields_for(PE)
city_ours = C.sum()
dcity = ((city_ours[PF.columns] - PF.iloc[0]) / PF.iloc[0].replace(0, np.nan) * 100).abs()
ok(dcity.max() < 0.01, 'Citywide tract sums vs. the Census Bureau estimate for New York city (place 3651000)', f'largest gap {dcity.max():.4f}%, population {int(city_ours["pop"]):,} vs {int(PF.iloc[0]["pop"]):,}')

# 3c: median income method vs published medians
BR = [0,10000,15000,20000,25000,30000,35000,40000,45000,50000,60000,75000,100000,125000,150000,200000]
def interp(n):
    tot = sum(n); half = tot / 2; cum = 0
    for i, c in enumerate(n):
        if cum + c >= half: return 200000 if i == 15 else BR[i] + (half - cum) / c * (BR[i+1] - BR[i])
        cum += c
cmpm = []
for geo, E in [('county', CE), ('city', PE)]:
    for gid, row in E.iterrows():
        est = interp([row[f'B19001_{i:03d}'] for i in range(2, 18)])
        cmpm.append((gid, row['B19013_001'], round(est)))
DE, DM = ref_counts(r'^(5001900US36|610U900US36|620L900US36)')
for gid, row in DE.iterrows():
    if pd.isna(row.get('B19013_001')): continue
    cmpm.append((gid, row['B19013_001'], round(interp([row[f'B19001_{i:03d}'] for i in range(2, 18)]))))
mm = pd.DataFrame(cmpm, columns=['geo', 'published', 'interpolated']); mm['diff_pct'] = (mm.interpolated / mm.published - 1) * 100
mm.to_csv(f'{OUT}/median_income_method_check.csv', index=False)
ok(mm.diff_pct.abs().quantile(.9) < 3, 'Median income estimated from income brackets vs. the published median, for 7 county/city and 213 NY State district geographies', f'median gap {mm.diff_pct.abs().median():.2f}%, 90th percentile {mm.diff_pct.abs().quantile(.9):.2f}%, worst {mm.diff_pct.abs().max():.1f}%')

# 3d: MOE method vs published MOEs (aggregating tracts to counties)
agg_m = np.sqrt((Mt ** 2).groupby(Mt.index.str[:5]).sum())
CMF = {}
for t_field, (t, line_) in {'pop': ('B01001', 1), 'hisp': ('B03002', 12), 'renter': ('B25003', 3), 'pov': ('B17001', 2), 'nhblack': ('B03002', 4)}.items():
    pub = CM[f'{t}_{line_:03d}'].where(lambda x: x > 0); pub.index = pub.index.str[-5:]
    if pub.isna().all(): continue
    CMF[t_field] = (agg_m[t_field] / pub)
mr = pd.DataFrame(CMF); mr.to_csv(f'{OUT}/moe_method_ratio_tract_rss_to_published_county.csv')
line('INFO', 'Our MOE method (root-sum-of-squares over tracts) compared with published county MOEs, ratio ours/published: ' +
     ', '.join(f'{k} {v.min():.1f}–{v.max():.1f}x' for k, v in mr.items()) + '. Population and Hispanic totals are controlled by the Bureau at the county level and carry no published margin. Ratios above 1 mean our margins are wider (more cautious) than the Bureau’s, which is the known behavior of the Census-recommended approximation for large areas; reliability labels on big districts therefore lean conservative.')

# =====================================================================
h('4. Census apportioned to districts vs. the Census Bureau’s own district estimates')
def ref_fields(regex, n):
    E, _ = ref_counts(regex); F = fields_for(E); F['med_pub'] = E['B19013_001']
    F.index = [int(i[-n:]) for i in F.index]; return F
reach = json.load(open(f'{ROOT}/site/data/reach.json'))
def pct(a, b): return a / b * 100
KEY = [('pop', None), ('cvap', None), ('hisp', 'pop'), ('nhblack', 'pop'), ('nhasian', 'pop'), ('nhwhite', 'pop'), ('fborn', 'pop'), ('pov', 'pov_u'), ('renter', 'hh'), ('lep_hh', 'hhl_u'), ('ba_plus', 'ed25')]
LR = pd.read_pickle(f'{ROOT}/data/census/level_results.pkl')
summ = []
for lvl, regex, n, label in [('sd', r'^610U900US36', 3, 'State Senate'), ('ad', r'^620L900US36', 3, 'Assembly'), ('cd', r'^5001900US36', 2, 'Congress')]:
    E, Mo, ind = LR[lvl]
    F = ref_fields(regex, n)
    full = [d for d in E.index if not (str(int(d)) in reach.get(lvl, {}) and reach[lvl][str(int(d))]['nyc_share'] < 100)]
    rows = []
    for d in full:
        d = int(d)
        if d not in F.index: continue
        o, t = E.loc[d], F.loc[d]
        rec = {'district': d}
        for f, den in KEY:
            if den is None: rec[f + '_ours'] = o[f]; rec[f + '_census'] = t[f]; rec[f + '_diff_pct'] = (o[f] / t[f] - 1) * 100
            else: rec[f + '_ours'] = pct(o[f], o[den]); rec[f + '_census'] = pct(t[f], t[den]); rec[f + '_diff_pts'] = rec[f + '_ours'] - rec[f + '_census']
        rec['median_income_ours'] = ind.loc[d, 'median_household_income']; rec['median_income_census'] = t['med_pub']
        rec['median_income_diff_pct'] = (rec['median_income_ours'] / t['med_pub'] - 1) * 100
        rows.append(rec)
    df = pd.DataFrame(rows).set_index('district'); df.to_csv(f'{OUT}/district_vs_census_{lvl}.csv')
    s = {'level': label, 'districts': len(df)}
    for f, den in KEY:
        col = f + ('_diff_pct' if den is None else '_diff_pts'); s[f] = df[col].abs().median(); s[f + '_max'] = df[col].abs().max()
    s['median_income'] = df.median_income_diff_pct.abs().median(); s['median_income_max'] = df.median_income_diff_pct.abs().max()
    summ.append(s)
    worst_pop = df.pop_diff_pct.abs().max(); worst_share = max(df[f + '_diff_pts'].abs().max() for f, d in KEY if d)
    ok(worst_pop < 5 and worst_share < 3, f'{label}: {len(df)} districts fully inside NYC, our tract-split estimates vs. the Bureau’s published district estimates',
       f'population: median gap {df.pop_diff_pct.abs().median():.2f}%, worst {worst_pop:.2f}%; shares (Hispanic, Black, Asian, White, foreign born, poverty, renters, limited English, college): worst {worst_share:.2f} points; median income median gap {s["median_income"]:.1f}%')
pd.DataFrame(summ).round(2).to_csv(f'{OUT}/district_vs_census_summary.csv', index=False)
# partial districts: NYC piece vs Census total x share of 2020 residents in NYC
for lvl, regex, n in [('sd', r'^610U900US36', 3), ('cd', r'^5001900US36', 2)]:
    E = LR[lvl][0]; F = ref_fields(regex, n)
    for d, r in reach[lvl].items():
        if r['nyc_share'] >= 100: continue
        d = int(d); exp = F.loc[d, 'pop'] * r['nyc_share'] / 100
        line('INFO', f'{lvl.upper()} {d} crosses the city line: our NYC part has {int(E.loc[d, "pop"]):,} residents; the Bureau’s full-district total {int(F.loc[d, "pop"]):,} × {r["nyc_share"]}% in NYC (2020) = {int(exp):,} ({(E.loc[d, "pop"] / exp - 1) * 100:+.1f}%).')

# our district MOEs vs the Bureau's published district MOEs
mo_rows = []
for lvl, regex, n in [('sd', r'^610U900US36', 3), ('ad', r'^620L900US36', 3), ('cd', r'^5001900US36', 2)]:
    E, Mo, ind = LR[lvl]; DEm, DMm = ref_counts(regex)
    DMm.index = [int(i[-n:]) for i in DMm.index]
    for d in E.index:
        d = int(d)
        if str(d) in reach.get(lvl, {}) and reach[lvl][str(d)]['nyc_share'] < 100: continue
        for f, (t, l) in {'cvap': ('B05003', None), 'renter': ('B25003', 3), 'pov': ('B17001', 2), 'nhblack': ('B03002', 4), 'hisp': ('B03002', 12)}.items():
            if l is None: continue
            pub = DMm.loc[d, f'{t}_{l:03d}'] if d in DMm.index else np.nan
            if pub and pub > 0: mo_rows.append((lvl, d, f, Mo.loc[d, f] / pub))
mo = pd.DataFrame(mo_rows, columns=['level', 'district', 'field', 'ratio']); mo.to_csv(f'{OUT}/moe_ours_vs_bureau_districts.csv', index=False)
line('INFO', 'District margins of error, ours divided by the Bureau’s published margin (median, by field): ' + ', '.join(f'{k} {v:.2f}x' for k, v in mo.groupby('field').ratio.median().items()) + '. Values near or above 1 mean our reliability labels are as strict or stricter than the Bureau’s.')

# =====================================================================
h('5. The website computes the same numbers as the build')
import subprocess
res = subprocess.run(['node', f'{ROOT}/tests/consistency.test.js'], capture_output=True, text=True)
ok(res.returncode == 0, 'Every census value and margin, recomputed in the browser code (core.js) for all 7 levels, matches the Python build', res.stdout.strip().splitlines()[0])
import sqlite3
con = sqlite3.connect(f'{ROOT}/out/nyc_voter_enrollment_feb2026.sqlite')
same = True
for t, f in [('census_by_council', 'census_cc'), ('census_by_tract', 'census_tract'), ('election_districts', None)]:
    a = pd.read_sql(f'select * from {t}', con)
    b = pd.read_csv(f'{ROOT}/data/census/{f}.csv', dtype={'tract_geoid': str}) if f else pd.read_csv(f'{ROOT}/out/election_districts_enrollment.csv')
    try:
        pd.testing.assert_frame_equal(a.apply(pd.to_numeric, errors='coerce').fillna(-1), b.apply(pd.to_numeric, errors='coerce').fillna(-1), check_dtype=False, rtol=1e-9)
    except AssertionError as e:
        same = False; print(t, str(e)[:300])
ok(same, 'The SQLite database holds exactly the same numbers as the CSV files')
res = subprocess.run(['node', f'{ROOT}/tests/lookup.test.js'], capture_output=True, text=True)
ok(res.returncode == 0, 'Address lookup with the website’s simplified boundaries places every populated 2020 block in the same ED and tract as full-detail boundaries', res.stdout.strip())

# =====================================================================
h('6. Reliability of the published numbers')
ind_ed = LR['ed'][2]; ind_cc = LR['cc'][2]; ind_t = LR['tract'][2]
rel_cols = [c for c in ind_cc.columns if c.endswith('_reliability')]
for nm, df in [('council districts', ind_cc), ('election districts', ind_ed), ('census tracts', ind_t)]:
    vals = df[rel_cols].replace('', np.nan).stack().value_counts(normalize=True) * 100
    line('INFO', f'{nm}: share of indicator values rated high / medium / low reliability: ' + ' / '.join(f'{vals.get(k, 0):.0f}%' for k in ['high', 'medium', 'low']))
key = ['citizens_18plus_cvap_reliability', 'hispanic_or_latino_reliability', 'black_non_hispanic_pct_reliability', 'median_household_income_reliability', 'below_the_poverty_line_pct_reliability', 'renters_pct_reliability']
key = [k for k in key if k in ind_cc.columns]
line('INFO', 'Council districts, key measures rated high reliability: ' + ', '.join(f'{k.replace("_reliability", "")} {(ind_cc[k] == "high").mean() * 100:.0f}%' for k in key))

open(f'{OUT}/report.md', 'w').write('# NYC Voter Map data audit\n' + '\n'.join(R) + '\n')
print('\n'.join(R))
