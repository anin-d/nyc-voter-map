"""Official citizen voting-age population (CVAP special tabulation, ACS 2020-2024) by block group,
split into EDs with 2020 Census blocks, with margins of error. Checked against the Bureau's own county,
congressional, state senate and assembly CVAP tables."""
import os, json
import numpy as np, pandas as pd, geopandas as gpd, pyogrio

ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = os.environ.get('SITE_DIR', f'{ROOT}/site')
OUT = f'{ROOT}/data/cvap'; os.makedirs(OUT, exist_ok=True)
NYC = ('36005', '36047', '36061', '36081', '36085')

def lines(df):
    """Per geography: CVAP and citizens by group with MOEs. Lines 3-12 are non-Hispanic race groups, 13 Hispanic."""
    p = df.pivot_table(index='geoid', columns='lnnumber', values=['cvap_est', 'cvap_moe', 'cit_est', 'cit_moe'], aggfunc='first')
    E = pd.DataFrame(index=p.index); M = pd.DataFrame(index=p.index)
    def put(name, col, lns):
        est = p[col + '_est'][lns].fillna(0); moe = p[col + '_moe'][lns].fillna(0)
        nz2 = (moe.where(est > 0, 0) ** 2).sum(axis=1); zmax = moe.where(est == 0, 0).max(axis=1)
        E[name] = est.sum(axis=1); M[name] = np.sqrt(nz2 + zmax ** 2)
    put('cvap', 'cvap', [1]); put('cit', 'cit', [1])
    put('cvap_hisp', 'cvap', [13]); put('cvap_nhw', 'cvap', [7]); put('cvap_nhb', 'cvap', [5]); put('cvap_nha', 'cvap', [4])
    put('cvap_nho', 'cvap', [3, 6, 8, 9, 10, 11, 12])
    return E, M, p

def main():
    raw = pd.read_csv(f'{ROOT}/raw/cvap/nyc_bg.csv', header=None,
                      names=['geoname', 'lntitle', 'geoid', 'lnnumber', 'cit_est', 'cit_moe', 'cvap_est', 'cvap_moe'])
    raw['geoid'] = raw.geoid.str[-12:]
    E, M, p = lines(raw)
    # structural check: non-Hispanic groups add to line 2, line 2 + Hispanic = total
    assert (p['cvap_est'][[3, 4, 5, 6, 7, 8, 9, 10, 11, 12]].sum(axis=1) == p['cvap_est'][2]).all(), 'race lines do not add to non-Hispanic total'
    assert (p['cvap_est'][2] + p['cvap_est'][13] == p['cvap_est'][1]).all(), 'Hispanic + non-Hispanic != total'
    # 2020 blocks -> EDs (same placement as the census build), weights within each block group
    xw_t = pd.read_csv(f'{ROOT}/data/census/xw_tract_ed.csv', dtype={'tract': str})
    b = pyogrio.read_dataframe(f'zip://{ROOT}/raw/census/tl_2020_36_tabblock20.zip', read_geometry=False,
                               columns=['GEOID20', 'COUNTYFP20', 'POP20', 'HOUSING20', 'INTPTLAT20', 'INTPTLON20'])
    b = b[b.COUNTYFP20.isin([c[2:] for c in NYC])].copy(); b['bg'] = b.GEOID20.str[:12]
    pts = gpd.GeoDataFrame(b, geometry=gpd.points_from_xy(b.INTPTLON20.astype(float), b.INTPTLAT20.astype(float)), crs=4326).to_crs(2263)
    eds = gpd.read_file(f'{ROOT}/data/eds_attr.geojson').to_crs(2263)[['id', 'geometry']]
    j = gpd.sjoin(pts, eds, predicate='within', how='left'); j = j[~j.index.duplicated()]
    miss = j.id.isna()
    if miss.any():
        near = gpd.sjoin_nearest(pts[miss], eds, how='left'); near = near[~near.index.duplicated()]; j.loc[miss, 'id'] = near.id
    j['id'] = j.id.astype(int)
    xw = j.groupby(['bg', 'id']).agg(pop20=('POP20', 'sum'), hu20=('HOUSING20', 'sum'), blocks=('GEOID20', 'size')).reset_index()
    tp = xw.groupby('bg').pop20.transform('sum'); ep = xw.groupby('id').pop20.transform('sum'); nb = xw.groupby('bg').blocks.transform('sum')
    xw['w_pop'] = (xw.pop20 / tp.replace(0, np.nan)).fillna(xw.blocks / nb)
    xw['w_ed'] = (xw.pop20 / ep.replace(0, np.nan)).fillna(xw.blocks / xw.groupby('id').blocks.transform('sum'))
    xw['w_pop'] = xw.w_pop.round(6); xw['w_ed'] = xw.w_ed.round(6)
    xw = xw.rename(columns={'id': 'elect_dist'})
    xw.to_csv(f'{OUT}/xw_blockgroup_ed.csv', index=False)
    bgs = list(E.index); bix = {g: i for i, g in enumerate(bgs)}
    missing = set(bgs) - set(xw.bg)
    print('block groups', len(bgs), 'without 2020 blocks', len(missing), 'CVAP in them', int(E.loc[list(missing), 'cvap'].sum()) if missing else 0)
    web_xw = {}
    for r in xw.itertuples():
        if r.bg in bix: web_xw.setdefault(str(r.elect_dist), []).append([bix[r.bg], r.w_pop, r.w_pop, r.w_ed])
    fields = list(E.columns)
    E2 = E.round(0).astype(int); M2 = M.round(0).astype(int)
    json.dump({'source': 'CVAP special tabulation, ACS 2020-2024, block groups; 2020 Census block weights', 'fields': fields, 'person_fields': fields,
               'tracts': bgs, 'counts': E2.to_numpy().tolist(), 'moe': M2.to_numpy().tolist(), 'tract_info': [[''] * 4 for _ in bgs], 'xw': web_xw},
              open(f'{SITE}/data/cvap.json', 'w'), separators=(',', ':'))
    E2.to_csv(f'{OUT}/cvap_blockgroup_counts.csv', index_label='blockgroup_geoid'); M2.to_csv(f'{OUT}/cvap_blockgroup_moe.csv', index_label='blockgroup_geoid')
    print('cvap.json bytes', os.path.getsize(f'{SITE}/data/cvap.json'), 'NYC CVAP', int(E.cvap.sum()))
    # indicators by level, with the same math as the website
    import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import indicators_lib as IL
    SPEC = [
        dict(k='cvap', src='cvap', cat='people', label='Eligible voters (citizens 18+)', type='num', num='cvap', col='eligible_voters_cvap',
             desc='Citizens 18 and over: the Census Bureau’s official citizen voting-age population (CVAP special tabulation, 2020–2024), by block group.'),
        dict(k='reg', src='cvap', cat='people', label='Active voters per 100 eligible', type='reg', col='active_voters_per_100_eligible',
             desc='Active registered voters (Feb 2026) for every 100 eligible voters (official CVAP, 2020–2024). Low numbers point to unregistered eligible voters.'),
        dict(k='cvap_hisp', src='cvap', cat='race', label='Eligible voters who are Hispanic or Latino', short='Hispanic', num='cvap_hisp', den='cvap', unit='of eligible voters', col='eligible_hispanic_pct', evrace='#d9822b'),
        dict(k='cvap_nhb', src='cvap', cat='race', label='Eligible voters who are Black', short='Black', num='cvap_nhb', den='cvap', unit='of eligible voters', col='eligible_black_non_hispanic_pct', evrace='#7b5ea7'),
        dict(k='cvap_nha', src='cvap', cat='race', label='Eligible voters who are Asian', short='Asian', num='cvap_nha', den='cvap', unit='of eligible voters', col='eligible_asian_non_hispanic_pct', evrace='#2a9d8f'),
        dict(k='cvap_nhw', src='cvap', cat='race', label='Eligible voters who are White', short='White', num='cvap_nhw', den='cvap', unit='of eligible voters', col='eligible_white_non_hispanic_pct', evrace='#8c99a6'),
        dict(k='cvap_nho', src='cvap', cat='race', label='Eligible voters of another or multiple races', short='Other', num='cvap_nho', den='cvap', unit='of eligible voters', col='eligible_other_or_multiracial_pct', evrace='#c9a227'),
    ]
    acs = json.load(open(f'{ROOT}/data/census/indicators.json'))
    merged = {'min_den': acs['min_den'], 'indicators': SPEC[:2] + acs['indicators'][:1] + [i for i in acs['indicators'] if i['cat'] == 'people'][1:] + SPEC[2:] + [i for i in acs['indicators'] if i['cat'] != 'people']}
    assert len(merged['indicators']) == len(SPEC) + len(acs['indicators']) and len({i['k'] for i in merged['indicators']}) == len(merged['indicators'])
    json.dump(merged, open(f'{SITE}/data/indicators.json', 'w'), ensure_ascii=False, indent=1)
    json.dump(merged, open(f'{OUT}/indicators_all.json', 'w'), ensure_ascii=False, indent=1)
    mem = pd.read_csv(f'{ROOT}/data/ed_crosswalk_raw.csv').rename(columns={'ElectDist': 'elect_dist'}).set_index('elect_dist')[['cc', 'ad', 'sd', 'cd']]
    mem = mem.join(gpd.read_file(f'{ROOT}/data/eds_attr.geojson')[['id', 'boro']].set_index('id'))
    xwm = xw.join(mem, on='elect_dist'); xwm['w_hu'] = xwm.w_pop
    edv = json.load(open(f'{SITE}/data/enroll.json'))['ed']
    VCOLS = [f'{p}_{s}' for s in ['total', 'active', 'inactive'] for p in ['dem', 'rep', 'con', 'wor', 'oth', 'blank', 'total']]
    V = pd.DataFrame.from_dict({int(k): v for k, v in edv.items()}, orient='index'); V.columns = VCOLS
    Vm = V.join(mem, how='left')
    Ef, Mf = E2.astype(float), M2.astype(float)        # the same published integers the site gets
    for lvl in ['ed', 'cc', 'ad', 'sd', 'cd', 'boro']:
        key = 'elect_dist' if lvl == 'ed' else lvl
        Eu, Mu = IL.unit_counts(xwm, key, 'bg', Ef, Mf, fields, 'cvap')
        VV = (V if lvl == 'ed' else Vm.groupby(key)[VCOLS].sum()).reindex(Eu.index).fillna(0)
        ind = IL.indicator_table(SPEC, Eu, Mu, VV, None, merged['min_den'], 'share_of_eligible_from_split_block_groups')
        ind.index.name = {'ed': 'elect_dist', 'cc': 'council_district', 'ad': 'assembly_district', 'sd': 'senate_district', 'cd': 'congressional_district', 'boro': 'borough'}[lvl]
        ind.to_csv(f'{OUT}/cvap_{lvl}.csv')
    # tracts: block groups nest in tracts, so a tract is the exact sum of its block groups
    xt = pd.DataFrame({'bg': bgs, 'tract': [g[:11] for g in bgs], 'w_pop': 1.0, 'w_hu': 1.0})
    Eu, Mu = IL.unit_counts(xt, 'tract', 'bg', Ef, Mf, fields, 'cvap')
    xwt = pd.read_csv(f'{ROOT}/data/census/xw_tract_ed.csv', dtype={'tract': str})
    Vt = pd.DataFrame(V.reindex(xwt.elect_dist).fillna(0).to_numpy() * xwt.w_ed.to_numpy()[:, None], columns=VCOLS); Vt['tract'] = xwt.tract.values
    Vt = Vt.groupby('tract').sum().reindex(Eu.index).fillna(0)
    ind = IL.indicator_table(SPEC, Eu, Mu, Vt, None, merged['min_den'], 'share_of_eligible_from_split_block_groups')
    ind.index.name = 'tract_geoid'; ind.to_csv(f'{OUT}/cvap_tract.csv')
    print('citywide active voters per 100 eligible (official CVAP):', round(V.total_active.sum() / E.cvap.sum() * 100, 1))

if __name__ == '__main__':
    main()
