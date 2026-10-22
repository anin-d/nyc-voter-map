"""Build ACS 2020-2024 tract indicators for NYC, a block-weighted tract<->ED crosswalk,
and indicator tables at every political level.

Outputs (data/census/):
  tract_counts.csv           base counts per tract (what everything else is built from)
  xw_tract_ed.csv            tract x ED pieces with 2020 population and housing-unit weights
  census_<level>.csv         indicators at ed, cc, ad, sd, cd, boro, tract
  web_census.json            compact payload for the map
"""
import os, json, glob
import numpy as np, pandas as pd, geopandas as gpd, pyogrio

ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = f'{ROOT}/data/census'; os.makedirs(OUT, exist_ok=True)

# ---------- 1. read ACS tables (estimates and margins of error) ----------
def read(t):
    d = pd.read_csv(f'{ROOT}/raw/acs/nyc_{t}.dat', sep='|', dtype=str).set_index('GEO_ID')
    d.index = d.index.str[-11:]
    d = d.apply(pd.to_numeric, errors='coerce')
    e = d[[c for c in d.columns if '_E' in c]]; e.columns = [c.replace('_E', '_') for c in e.columns]
    m = d[[c for c in d.columns if '_M' in c]]; m.columns = [c.replace('_M', '_') for c in m.columns]
    return e, m
EL, ML = [], []
for f in sorted(glob.glob(f'{ROOT}/raw/acs/nyc_*.dat')):
    e, m = read(os.path.basename(f)[4:-4]); EL.append(e); ML.append(m)
A = pd.concat(EL, axis=1); AM = pd.concat(ML, axis=1)
A = A.mask(A < -100000)          # jam values: -666666666 not available, etc.
AM = AM.where(AM >= 0)           # -222222222 / -333333333 / -555555555 -> no MOE
r = lambda a, b: list(range(a, b + 1))
def G(t, *lines):
    """Sum of table cells with its MOE. Census guidance for sums: root-sum-of-squares of the cell MOEs,
    but among cells estimated at zero only the largest MOE is counted once."""
    cols = [f'{t}_{l:03d}' for l in lines]
    est = A[cols].fillna(0); moe = AM[cols].fillna(0)
    nz2 = (moe.where(est > 0, 0) ** 2).sum(axis=1)
    zmax = moe.where(est == 0, 0).max(axis=1)
    return est.sum(axis=1), np.sqrt(nz2 + zmax ** 2)
C = pd.DataFrame(index=A.index); M = pd.DataFrame(index=A.index)
def put(name, t, *lines): C[name], M[name] = G(t, *lines)
# people (weighted by 2020 population)
put('pop', 'B01001', 1)
put('age_u18', 'B01001', *r(3, 6), *r(27, 30))
put('age18_29', 'B01001', *r(7, 11), *r(31, 35))
put('age30_44', 'B01001', *r(12, 14), *r(36, 38))
put('age45_64', 'B01001', *r(15, 19), *r(39, 43))
put('age65p', 'B01001', *r(20, 25), *r(44, 49))
put('adults', 'B01001', *r(7, 25), *r(31, 49))
put('cvap', 'B05003', 9, 11, 20, 22)
put('natz18', 'B05003', 11, 22)
put('noncit18', 'B05003', 12, 23)
put('fborn', 'B05003', 5, 10, 16, 21)
put('hisp', 'B03002', 12); put('nhwhite', 'B03002', 3); put('nhblack', 'B03002', 4)
put('nhasian', 'B03002', 6); put('nhother', 'B03002', 5, 7, 8, 9)
for k, l in dict(o_pr=5, o_dom=7, o_mex=4, o_ecu=21, o_col=20, o_salv=14).items(): put(k, 'B03001', l)
for k, l in dict(a_chi=2, a_ind=21, a_ban=22, a_kor=5, a_fil=12, a_pak=25).items(): put(k, 'B02015', l)
for k, l in dict(n_wi=94, n_jam=102, n_hai=101, n_guy=45, n_tri=103, n_arab=6, n_ita=51, n_iri=49, n_rus=64, n_pol=61, n_ukr=92).items(): put(k, 'B04006', l)
put('pop5', 'C16001', 1)
LANG = dict(spa=3, fre=6, sla=12, oie=15, kor=18, chi=21, vie=24, tag=27, oap=30, ara=33)
for k, tot in LANG.items(): put('l_' + k, 'C16001', tot)
put('lep', 'C16001', 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35, 38)
put('pov_u', 'B17001', 1); put('pov', 'B17001', 2)
put('clf', 'B23025', 3); put('unemp', 'B23025', 5)
put('vet_u', 'B21001', 1); put('vet', 'B21001', 2)
put('ed25', 'B15003', 1); put('ba_plus', 'B15003', *r(22, 25)); put('hs_less', 'B15003', *r(2, 18))
put('ins_u', 'B27010', 1); put('unins', 'B27010', 17, 33, 50, 66)
PERSON = list(C.columns)
# households (weighted by 2020 housing units)
put('hh', 'B25003', 1); put('renter', 'B25003', 3); put('owner', 'B25003', 2)
put('snap_u', 'B22003', 1); put('snap', 'B22003', 2)
put('hhl_u', 'C16002', 1); put('lep_hh', 'C16002', 4, 7, 10, 13)
put('rent_u', 'B25070', *r(2, 10)); put('burden30', 'B25070', *r(7, 10)); put('burden50', 'B25070', 10)
put('moved_u', 'B25038', 1); put('moved20', 'B25038', 3, 4, 10, 11)
put('kids_u', 'B11005', 1); put('hh_kids', 'B11005', 2)
put('net_u', 'B28002', 1); put('no_net', 'B28002', 13)
for i in range(16): put(f'inc{i:02d}', 'B19001', i + 2)
HOUSE = [c for c in C.columns if c not in PERSON]
TRACT_ONLY = pd.DataFrame({'med_inc_pub': A['B19013_001'], 'med_inc_moe': AM['B19013_001'], 'med_rent_pub': A['B25064_001'], 'med_rent_moe': AM['B25064_001']}, index=A.index)
assert (C['adults'] == C['pop'] - C['age_u18']).all(), 'age cells do not add up'
C = C.round(0).astype(int); M = M.round(0).astype(int)

# ---------- 2. block-weighted crosswalk ----------
b = pyogrio.read_dataframe(f'zip://{ROOT}/raw/census/tl_2020_36_tabblock20.zip', read_geometry=False,
                           columns=['GEOID20', 'COUNTYFP20', 'POP20', 'HOUSING20', 'INTPTLAT20', 'INTPTLON20'])
b = b[b.COUNTYFP20.isin(['005', '047', '061', '081', '085'])].copy()
b['tract'] = b.GEOID20.str[:11]
pts = gpd.GeoDataFrame(b, geometry=gpd.points_from_xy(b.INTPTLON20.astype(float), b.INTPTLAT20.astype(float)), crs=4326).to_crs(2263)
eds = gpd.read_file(f'{ROOT}/data/eds_attr.geojson').to_crs(2263)[['id', 'geometry']]
j = gpd.sjoin(pts, eds, predicate='within', how='left')
j = j[~j.index.duplicated()]
miss = j.id.isna()
if miss.any():
    near = gpd.sjoin_nearest(pts[miss], eds, how='left'); near = near[~near.index.duplicated()]
    j.loc[miss, 'id'] = near.id
j['id'] = j.id.astype(int)
print('blocks', len(j), 'outside any ED (snapped to nearest):', int(miss.sum()), 'pop', int(j.loc[miss, 'POP20'].sum()))

xw = j.groupby(['tract', 'id']).agg(pop20=('POP20', 'sum'), hu20=('HOUSING20', 'sum'), blocks=('GEOID20', 'size')).reset_index()
tp = xw.groupby('tract')[['pop20', 'hu20']].transform('sum'); ep = xw.groupby('id')[['pop20', 'hu20']].transform('sum')
xw['w_pop'] = np.where(tp.pop20 > 0, xw.pop20 / tp.pop20.replace(0, np.nan), np.nan)
xw['w_hu'] = np.where(tp.hu20 > 0, xw.hu20 / tp.hu20.replace(0, np.nan), np.nan)
nb = xw.groupby('tract').blocks.transform('sum')
xw['w_pop'] = xw.w_pop.fillna(xw.w_hu).fillna(xw.blocks / nb)       # no residents in 2020: fall back to housing, then block count
xw['w_hu'] = xw.w_hu.fillna(xw.w_pop)
# ED -> tract weights for apportioning voters to tracts
xw['w_ed'] = np.where(ep.pop20 > 0, xw.pop20 / ep.pop20.replace(0, np.nan), np.nan)
xw['w_ed'] = xw.w_ed.fillna(xw.hu20 / ep.hu20.replace(0, np.nan)).fillna(xw.blocks / xw.groupby('id').blocks.transform('sum'))
xw = xw.rename(columns={'id': 'elect_dist'})
# tracts in ACS but with no blocks (water-only) and EDs with voters but no blocks
acs_tracts = set(C.index); xw_tracts = set(xw.tract)
print('ACS tracts', len(acs_tracts), 'in crosswalk', len(acs_tracts & xw_tracts), 'ACS pop in tracts missing from crosswalk:', int(C.loc[list(acs_tracts - xw_tracts), 'pop'].sum()))
edv = json.load(open(f'{ROOT}/data/enroll.json'))['ed']
no_xw = [e for e in edv if int(e) not in set(xw.elect_dist)]
print('EDs with voters but no 2020 blocks:', len(no_xw), sum(edv[e][6] for e in no_xw))
for k in ['w_pop', 'w_hu', 'w_ed']: xw[k] = xw[k].round(6)
xw.to_csv(f'{OUT}/xw_tract_ed.csv', index=False)

# label-point fallback for voter EDs without blocks
tr = gpd.read_file(f'{ROOT}/raw/tracts2020.geojson').to_crs(2263)[['GEOID', 'geometry']]
labels = json.load(open(f'{ROOT}/site/data/labels.json'))['ed']
extra = []
for e in no_xw:
    if e not in labels: continue
    lat, lng = labels[e]
    p = gpd.GeoSeries(gpd.points_from_xy([lng], [lat]), crs=4326).to_crs(2263).iloc[0]
    hit = tr[tr.contains(p)]
    if len(hit): extra.append(dict(tract=hit.GEOID.iloc[0], elect_dist=int(e), pop20=0, hu20=0, blocks=0, w_pop=0.0, w_hu=0.0, w_ed=1.0))
if extra: xw = pd.concat([xw, pd.DataFrame(extra)], ignore_index=True); xw.to_csv(f'{OUT}/xw_tract_ed.csv', index=False)
print('fallback ED->tract links added', len(extra))

# ---------- 3. indicator spec: one definition shared by this script and the website ----------
O = lambda k, label: dict(k=k, label=label, cat='origin', num=k, den='pop', origin=True)
L = lambda k, label: dict(k=k, label='Speak ' + label + ' at home', short=label, cat='lang', num=k, den='pop5', unit='of residents 5+', lang=True)
SPEC = [
 dict(k='pop', cat='people', label='Residents', type='num', num='pop', col='residents', desc='Total residents.'),
 dict(k='cvap', cat='people', label='Eligible voters (citizens 18+)', type='num', num='cvap', col='citizens_18plus_cvap', desc='U.S. citizens 18 and over, the citizen voting-age population (CVAP).'),
 dict(k='cvap_pct', cat='people', label='Adults who are citizens', num='cvap', den='adults', unit='of adults', col='citizens_pct_of_adults'),
 dict(k='reg', cat='people', label='Active voters per 100 eligible', type='reg', col='active_voters_per_100_cvap', desc='Active registered voters (Feb 2026) for every 100 citizens 18+ (ACS). Low numbers point to unregistered eligible voters.'),
 dict(k='age18_29', cat='people', label='Adults aged 18 to 29', num='age18_29', den='adults', unit='of adults'),
 dict(k='age30_44', cat='people', label='Adults aged 30 to 44', num='age30_44', den='adults', unit='of adults'),
 dict(k='age45_64', cat='people', label='Adults aged 45 to 64', num='age45_64', den='adults', unit='of adults'),
 dict(k='age65p', cat='people', label='Adults 65 and over', num='age65p', den='adults', unit='of adults'),
 dict(k='hisp', cat='race', label='Hispanic or Latino', num='hisp', den='pop', race='#d9822b'),
 dict(k='nhblack', cat='race', label='Black', num='nhblack', den='pop', race='#7b5ea7', desc='Non-Hispanic Black alone.', col='black_non_hispanic_pct'),
 dict(k='nhasian', cat='race', label='Asian', num='nhasian', den='pop', race='#2a9d8f', desc='Non-Hispanic Asian alone.', col='asian_non_hispanic_pct'),
 dict(k='nhwhite', cat='race', label='White', num='nhwhite', den='pop', race='#8c99a6', desc='Non-Hispanic White alone.', col='white_non_hispanic_pct'),
 dict(k='nhother', cat='race', label='Other or multiracial', num='nhother', den='pop', race='#c9a227', desc='Non-Hispanic, any other race or two or more races.', col='other_or_multiracial_non_hispanic_pct'),
 O('o_pr','Puerto Rican'), O('o_dom','Dominican'), O('o_mex','Mexican'), O('o_ecu','Ecuadorian'), O('o_col','Colombian'), O('o_salv','Salvadoran'),
 O('a_chi','Chinese'), O('a_ind','Indian'), O('a_ban','Bangladeshi'), O('a_pak','Pakistani'), O('a_kor','Korean'), O('a_fil','Filipino'),
 O('n_wi','West Indian (all)'), O('n_jam','Jamaican'), O('n_hai','Haitian'), O('n_guy','Guyanese'), O('n_tri','Trinidadian'),
 O('n_arab','Arab'), O('n_ita','Italian'), O('n_iri','Irish'), O('n_rus','Russian'), O('n_pol','Polish'), O('n_ukr','Ukrainian'),
 dict(k='fborn', cat='lang', label='Born outside the U.S.', num='fborn', den='pop'),
 dict(k='natz18', cat='lang', label='Naturalized citizens', num='natz18', den='adults', unit='of adults'),
 dict(k='noncit18', cat='lang', label='Adults who are not citizens', num='noncit18', den='adults', unit='of adults'),
 dict(k='lep_hh', cat='lang', label='Limited-English households', num='lep_hh', den='hhl_u', unit='of households', desc='Households where no one 14 or older speaks English very well.'),
 dict(k='lep', cat='lang', label='Speak English less than very well', num='lep', den='pop5', unit='of residents 5+'),
 L('l_spa','Spanish'), L('l_chi','Chinese'), L('l_sla','Russian, Polish or other Slavic'), L('l_fre','French or Haitian Creole'),
 L('l_oie','Other Indo-European (Bengali, Hindi, Urdu…)'), L('l_kor','Korean'), L('l_ara','Arabic'), L('l_tag','Tagalog'), L('l_vie','Vietnamese'),
 dict(k='med_inc', cat='money', label='Median household income', type='usd', col='median_household_income', desc='Published by the Census Bureau for single tracts; estimated from income brackets for larger areas.'),
 dict(k='pov', cat='money', label='Below the poverty line', num='pov', den='pov_u', unit='of residents'),
 dict(k='unemp', cat='money', label='Unemployment rate', num='unemp', den='clf', unit='of the labor force'),
 dict(k='snap', cat='money', label='Households receiving SNAP', num='snap', den='snap_u', unit='of households'),
 dict(k='unins', cat='money', label='No health insurance', num='unins', den='ins_u'),
 dict(k='hh', cat='housing', label='Households', type='num', num='hh', col='households'),
 dict(k='renter', cat='housing', label='Renters', num='renter', den='hh', unit='of households'),
 dict(k='burden30', cat='housing', label='Rent burdened (30%+ of income)', num='burden30', den='rent_u', unit='of renters', col='rent_burdened_30plus_pct'),
 dict(k='burden50', cat='housing', label='Severely rent burdened (50%+)', num='burden50', den='rent_u', unit='of renters', col='rent_burdened_50plus_pct'),
 dict(k='moved20', cat='housing', label='Moved in 2020 or later', num='moved20', den='moved_u', unit='of households', desc='Recent movers are more likely to need to update their registration.'),
 dict(k='hh_kids', cat='housing', label='Households with children', num='hh_kids', den='kids_u', unit='of households'),
 dict(k='no_net', cat='housing', label='Households without internet', num='no_net', den='net_u', unit='of households'),
 dict(k='ba_plus', cat='edu', label='Bachelor’s degree or higher', num='ba_plus', den='ed25', unit='of adults 25+', col='bachelors_or_higher_pct'),
 dict(k='hs_less', cat='edu', label='High school or less', num='hs_less', den='ed25', unit='of adults 25+'),
 dict(k='vet', cat='edu', label='Veterans', num='vet', den='vet_u', unit='of adults'),
]
import re as _re
for i in SPEC:
    if 'col' not in i: i['col'] = _re.sub(r'[^a-z0-9]+', '_', i['label'].lower().replace('’', '')).strip('_') + ('_pct' if 'type' not in i else '')
assert len({i['col'] for i in SPEC}) == len(SPEC) and len({i['k'] for i in SPEC}) == len(SPEC)
MIN_DEN = 30          # below this many people/households in the denominator, a share is not shown
json.dump({'min_den': MIN_DEN, 'indicators': SPEC}, open(f'{OUT}/indicators.json', 'w'), ensure_ascii=False, indent=1)

# ---------- 4. weights: every reporting unit as a set of tract shares ----------
mem = pd.read_csv(f'{ROOT}/data/ed_crosswalk_raw.csv').rename(columns={'ElectDist': 'elect_dist'}).set_index('elect_dist')[['cc', 'ad', 'sd', 'cd']]
attr = gpd.read_file(f'{ROOT}/data/eds_attr.geojson')[['id', 'boro']].set_index('id')
mem = mem.join(attr)
xwm = xw.join(mem, on='elect_dist')
cnt_cols = list(C.columns); isP = np.isin(np.array(cnt_cols), PERSON)
Cn = C.to_numpy(float); Mn = M.to_numpy(float); tix0 = {t: i for i, t in enumerate(C.index)}
def unit_counts(key):
    """Estimates and MOEs for every unit of a level. A unit's MOE adds, tract by tract, the tract MOE scaled
    by the unit's share of that tract (root-sum-of-squares across tracts)."""
    g = xwm.dropna(subset=[key]).groupby([key, 'tract'])[['w_pop', 'w_hu']].sum().reset_index()
    g['ti'] = g.tract.map(tix0)
    est, moe, split = {}, {}, {}
    pi = cnt_cols.index('pop')
    for u, grp in g.groupby(key):
        ti = grp.ti.to_numpy(); wp = grp.w_pop.to_numpy(); w = np.where(isP[None, :], wp[:, None], grp.w_hu.to_numpy()[:, None])
        est[u] = (Cn[ti] * w).sum(0); moe[u] = np.sqrt(((Mn[ti] * w) ** 2).sum(0))
        tot = est[u][pi]; split[u] = (Cn[ti, pi] * wp * (wp < 0.95)).sum() / tot if tot > 0 else 0.0
    E = pd.DataFrame(est, index=cnt_cols).T; Mo = pd.DataFrame(moe, index=cnt_cols).T
    E.attrs['split'] = pd.Series(split)
    return E, Mo
V = pd.DataFrame.from_dict({int(k): v for k, v in edv.items()}, orient='index')
VCOLS = [f'{p}_{s}' for s in ['total', 'active', 'inactive'] for p in ['dem', 'rep', 'con', 'wor', 'oth', 'blank', 'total']]
V.columns = VCOLS
Vm = V.join(mem, how='left')

# ---------- 5. indicators with margins of error ----------
BR_LO = [0, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 60000, 75000, 100000, 125000, 150000, 200000]
def median_from_brackets(n):
    tot = sum(n)
    if tot < 20: return np.nan
    half, cum = tot / 2, 0
    for i, c in enumerate(n):
        if cum + c >= half:
            if i == 15: return 200000.0
            return BR_LO[i] + (half - cum) / c * (BR_LO[i + 1] - BR_LO[i]) if c else BR_LO[i]
        cum += c
    return np.nan
def reliability(est, moe, split=0.0, reg=False):
    # CV under 15% high, 15-30% medium, over 30% low; mostly-split units cap at medium;
    # registration above 130 per 100 eligible marks a split that is off for that area.
    if est is None or moe is None or not np.isfinite(est) or not np.isfinite(moe): return ''
    if est <= 0: return 'low'
    if reg and est > 130: return 'low'
    cv = moe / 1.645 / est * 100
    r = 'high' if cv < 15 else 'medium' if cv < 30 else 'low'
    return 'medium' if r == 'high' and split > 0.5 else r
def indicator_table(E, Mo, voters, tract_pub=None):
    rows = {}
    SPL = E.attrs.get('split', pd.Series(dtype=float))
    for u in E.index:
        c, m = E.loc[u], Mo.loc[u]; v = voters.loc[u] if voters is not None and u in voters.index else None
        out = {}
        for i in SPEC:
            t = i.get('type'); x = mx = np.nan
            if t == 'num': x, mx = c[i['num']], m[i['num']]
            elif t == 'usd':
                if tract_pub is not None and pd.notna(tract_pub.med_inc_pub.get(u)): x, mx = tract_pub.med_inc_pub[u], tract_pub.med_inc_moe.get(u, np.nan)
                else: x = median_from_brackets([c[f'inc{k:02d}'] for k in range(16)])
            elif t == 'reg':
                if c['cvap'] >= MIN_DEN and v is not None: x = v['total_active'] / c['cvap'] * 100; mx = x * m['cvap'] / c['cvap']
            else:
                X, Y, mX, mY = c[i['num']], c[i['den']], m[i['num']], m[i['den']]
                if Y >= MIN_DEN:
                    pp = X / Y; rad = mX ** 2 - pp ** 2 * mY ** 2
                    if rad < 0: rad = mX ** 2 + pp ** 2 * mY ** 2
                    x, mx = pp * 100, np.sqrt(rad) / Y * 100
            out[i['col']] = x; out[i['col'] + '_moe'] = mx; out[i['col'] + '_reliability'] = reliability(x, mx, SPL.get(u, 0.0), t == 'reg') if pd.notna(mx) else ''
        out['share_of_residents_from_split_tracts'] = round(float(SPL.get(u, 0.0)) * 100, 1)
        rows[u] = out
    o = pd.DataFrame.from_dict(rows, orient='index')
    for i in SPEC:
        nd = 0 if i.get('type') in ('num', 'usd') else 1
        o[i['col']] = o[i['col']].round(nd); o[i['col'] + '_moe'] = o[i['col'] + '_moe'].round(nd)
    if voters is not None:
        vv = voters.reindex(o.index)
        o.insert(0, 'active_voters', vv['total_active'].round(1)); o.insert(0, 'registered_voters', vv['total_total'].round(1))
    return o

NAMES = {'ed': 'elect_dist', 'cc': 'council_district', 'ad': 'assembly_district', 'sd': 'senate_district', 'cd': 'congressional_district', 'boro': 'borough'}
LEVEL_RESULTS = {}
for lvl in ['ed', 'cc', 'ad', 'sd', 'cd', 'boro']:
    key = 'elect_dist' if lvl == 'ed' else lvl
    E, Mo = unit_counts(key)
    VV = V if lvl == 'ed' else Vm.groupby(key)[VCOLS].sum()
    if lvl == 'ed':
        spl = E.attrs['split']; E = E.reindex(E.index.union(V.index)); Mo = Mo.reindex(E.index); E.attrs['split'] = spl
    ind = indicator_table(E, Mo, VV.reindex(E.index).fillna(0))
    ind.index.name = NAMES[lvl]; ind.to_csv(f'{OUT}/census_{lvl}.csv')
    LEVEL_RESULTS[lvl] = (E, Mo, ind)
    print(lvl, ind.shape, 'pop', round(E['pop'].sum()))
# tract level: published medians, voters apportioned from EDs
Vt = pd.DataFrame(V.reindex(xw.elect_dist).fillna(0).to_numpy() * xw.w_ed.to_numpy()[:, None], columns=VCOLS); Vt['tract'] = xw.tract.values
Vt = Vt.groupby('tract').sum().reindex(C.index).fillna(0)
ti = indicator_table(C.astype(float), M.astype(float), Vt, TRACT_ONLY)
ti['median_gross_rent'] = TRACT_ONLY.med_rent_pub; ti['median_gross_rent_moe'] = TRACT_ONLY.med_rent_moe
tg = gpd.read_file(f'{ROOT}/raw/tracts2020.geojson').set_index('GEOID')[['BoroName', 'CT2020', 'NTAName', 'CDTA2020']]
ti = tg.reindex(ti.index).join(ti); ti.index.name = 'tract_geoid'
ti.to_csv(f'{OUT}/census_tract.csv')
LEVEL_RESULTS['tract'] = (C.astype(float), M.astype(float), ti)
C.to_csv(f'{OUT}/tract_counts.csv', index_label='tract_geoid')
M.to_csv(f'{OUT}/tract_counts_moe.csv', index_label='tract_geoid')
print('tract', ti.shape, 'voters apportioned to tracts', round(Vt.total_total.sum(), 1), 'of', int(V.total_total.sum()))
print('citywide active voters per 100 CVAP:', round(V.total_active.sum() / C.cvap.sum() * 100, 1))
import pickle; pickle.dump(LEVEL_RESULTS, open(f'{OUT}/level_results.pkl', 'wb'))

# ---------- 6. compact web payload ----------
tracts = list(C.index)
tix = {t: i for i, t in enumerate(tracts)}
xw_web = {}
for row in xw.itertuples():
    if row.tract not in tix: continue
    xw_web.setdefault(str(row.elect_dist), []).append([tix[row.tract], row.w_pop, row.w_hu, row.w_ed])
web = {'source': 'ACS 2020-2024 5-year estimates, Census tracts; 2020 Census block weights',
       'fields': cnt_cols, 'person_fields': PERSON, 'tracts': tracts,
       'counts': C.to_numpy().tolist(), 'moe': M.to_numpy().tolist(),
       'tract_info': [[tg.NTAName.get(t, ''), tg.CT2020.get(t, ''),
                       None if pd.isna(TRACT_ONLY.med_inc_pub.get(t)) else int(TRACT_ONLY.med_inc_pub.get(t)),
                       None if pd.isna(TRACT_ONLY.med_inc_moe.get(t)) else int(TRACT_ONLY.med_inc_moe.get(t)),
                       None if pd.isna(TRACT_ONLY.med_rent_pub.get(t)) else int(TRACT_ONLY.med_rent_pub.get(t))] for t in tracts],
       'xw': xw_web}
json.dump(web, open(f'{OUT}/web_census.json', 'w'), separators=(',', ':'))
print('web payload bytes', os.path.getsize(f'{OUT}/web_census.json'))
import shutil
shutil.copy(f'{OUT}/web_census.json', f'{ROOT}/site/data/census.json'); shutil.copy(f'{OUT}/indicators.json', f'{ROOT}/site/data/indicators.json')
