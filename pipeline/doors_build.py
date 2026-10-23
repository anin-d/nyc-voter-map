"""Doors: residential units by ED, from PLUTO 26v2 tax lots.

Each lot is placed at its PLUTO point. Lots with several buildings and 20+ units (Co-op City, Stuyvesant Town,
NYCHA campuses) are split across their buildings: units go to each building in proportion to footprint area
times roof height, and each building is placed at its own centroid. Checked against 2020 Census housing units.
Outputs: site/data/doors.json, data/doors/doors_<level>.csv
"""
import os, json
import numpy as np, pandas as pd, geopandas as gpd, pyogrio

ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); SITE = os.environ.get('SITE_DIR', f'{ROOT}/site')
OUT = f'{ROOT}/data/doors'; os.makedirs(OUT, exist_ok=True)
COLS = ['units', 'u1_2', 'u3_9', 'u10_49', 'u50', 'nycha', 'bldgs', 'pop20', 'hu20']
LABEL = {'units': 'residential_units', 'u1_2': 'units_in_1_2_unit_buildings', 'u3_9': 'units_in_3_9_unit_buildings',
         'u10_49': 'units_in_10_49_unit_buildings', 'u50': 'units_in_50plus_unit_buildings', 'nycha': 'nycha_units', 'bldgs': 'residential_buildings', 'pop20': 'population_2020_census', 'hu20': 'housing_units_2020_census'}

def main():
    p = pd.read_csv(f'{ROOT}/raw/pluto/pluto_26v2.csv', low_memory=False,
                    usecols=['bbl', 'borough', 'address', 'bldgclass', 'ownername', 'numbldgs', 'unitsres', 'resarea', 'latitude', 'longitude', 'bctcb2020', 'bct2020'])
    p = p[p.unitsres > 0].copy(); p['bbl'] = p.bbl.astype('int64').astype(str)
    # group quarters are not doors: hotels (H), hospitals and nursing homes (I), shelters (N), school buildings and dorms (W)
    gq = p.bldgclass.fillna('').str[0].isin(['H', 'I', 'N', 'W'])
    print('left out as group quarters or hotels: lots', int(gq.sum()), 'units', int(p.unitsres[gq].sum()))
    p = p[~gq].copy()
    p['nycha'] = p.ownername.fillna('').str.upper().str.replace(r'\s+', ' ', regex=True).str.startswith('NYC HOUSING AUTHORITY')
    # NYCHA: PLUTO books some developments' units on one lot of the development, so pool NYCHA units by
    # (consolidated) development and spread them over every NYCHA building footprint in it
    W = lambda g: g.geometry.area * pd.to_numeric(g.height_roof, errors='coerce').fillna(0).clip(lower=10)
    dev = gpd.read_file(f'{ROOT}/raw/nycha/developments.geojson').to_crs(2263)
    db = pd.DataFrame(json.load(open(f'{ROOT}/raw/nycha/databook.json')))
    ctds = {int(a): int(b) for a, b in zip(db.tds_, db.consolidated_tds_) if str(a).strip().isdigit() and str(b).strip().isdigit()}
    dev['grp'] = [ctds.get(int(t), int(t)) for t in dev.tds_num]
    nf = gpd.read_file(f'{ROOT}/raw/nycha/nycha_footprints.geojson').to_crs(2263); nf['bbl'] = nf.mappluto_bbl.astype(str); nf['w'] = W(nf)
    c = nf.copy(); c['geometry'] = nf.geometry.representative_point()
    jn = gpd.sjoin(c, dev[['grp', 'geometry']], predicate='within', how='left'); jn = jn[~jn.index.duplicated()]
    nf['grp'] = jn.grp.values
    ny = p[p.nycha].copy()
    lot_grp = nf.dropna(subset=['grp']).groupby('bbl').grp.agg(lambda s: s.mode().iloc[0])
    ny['grp'] = ny.bbl.map(lot_grp)
    nopt_ = ny.grp.isna() & ny.latitude.notna()
    if nopt_.any():
        q = gpd.GeoDataFrame(ny[nopt_].drop(columns='grp'), geometry=gpd.points_from_xy(ny.longitude[nopt_], ny.latitude[nopt_]), crs=4326).to_crs(2263)
        jq = gpd.sjoin(q, dev[['grp', 'geometry']], predicate='within', how='left'); jq = jq[~jq.index.duplicated()]
        ny.loc[nopt_, 'grp'] = jq.grp.values
    pool = ny.dropna(subset=['grp']).groupby('grp').unitsres.sum()
    # PLUTO sometimes books a NYCHA development's units impossibly: under 250 sq ft of residential floor area per unit.
    # Those lots take NYCHA's own Data Book apartment count for the development the lot sits in.
    apts = pd.to_numeric(db.number_of_current_apartments, errors='coerce')
    dbt = dict(zip(pd.to_numeric(db.tds_, errors='coerce'), apts))
    devpoly = dev[['tds_num', 'developmen', 'geometry']].copy(); devpoly['tds'] = devpoly.tds_num.astype(int)
    lp = gpd.GeoDataFrame(ny, geometry=gpd.points_from_xy(ny.longitude, ny.latitude), crs=4326).to_crs(2263)
    lj = gpd.sjoin(lp[['geometry']], devpoly[['tds', 'developmen', 'geometry']], predicate='within', how='left'); lj = lj[~lj.index.duplicated()]
    fixed = []
    for i, r in ny.iterrows():
        spu = r.resarea / r.unitsres if r.unitsres else np.nan
        t = lj.tds.get(i)
        if spu < 250 and pd.notna(t) and dbt.get(int(t), 0) > 0:
            fixed.append((r.address, lj.developmen.get(i), int(r.unitsres), int(dbt[int(t)])))
            if pd.notna(r.grp): pool[r.grp] = pool[r.grp] - r.unitsres + dbt[int(t)]
            ny.at[i, 'unitsres'] = dbt[int(t)]
    print('NYCHA lots corrected to the Data Book count:', fixed)
    nf = nf[nf.grp.isin(pool.index)].copy()
    nf['units'] = nf.w / nf.groupby('grp').w.transform('sum') * nf.grp.map(pool)
    nc = nf.geometry.representative_point()
    nycha_pieces = pd.DataFrame({'bbl': nf.bbl.values, 'units': nf.units.values, 'nycha': True, 'x': nc.x.values, 'y': nc.y.values, 'bct2020': np.nan, 'bldg_units': nf.units.values})
    pooled = set(ny.bbl[ny.grp.isin(pool.index)])
    total_units = p.unitsres.sum() + sum(d - u for _, _, u, d in fixed)
    print('NYCHA units pooled by development', int(pool.sum()), 'of', int(ny.unitsres.sum()), 'developments', len(pool), 'buildings', len(nf))
    p_rest = p[~p.bbl.isin(pooled)]
    # other lots with several buildings and 20+ units: split by building
    fp = gpd.read_file(f'{ROOT}/raw/footprints/complex_footprints.geojson').to_crs(2263)
    fp['w'] = W(fp)
    fp['bbl'] = fp.mappluto_bbl.astype(str)
    split = p_rest[(p_rest.numbldgs >= 2) & (p_rest.unitsres >= 20) & p_rest.bbl.isin(set(fp.bbl))]
    fp = fp[fp.bbl.isin(set(split.bbl))].copy()
    fp['share'] = fp.w / fp.groupby('bbl').w.transform('sum')
    lots = split.set_index('bbl')
    fp['units'] = fp.share * fp.bbl.map(lots.unitsres); fp['nycha'] = fp.bbl.map(lots.nycha)
    cen = fp.geometry.representative_point()
    pieces = pd.DataFrame({'bbl': fp.bbl.values, 'units': fp.units.values, 'nycha': fp.nycha.values, 'x': cen.x.values, 'y': cen.y.values,
                           'bct2020': fp.bbl.map(lots.bct2020).values, 'bldg_units': fp.units.values})
    rest = p_rest[~p_rest.bbl.isin(set(split.bbl))].copy()
    xy = gpd.GeoSeries(gpd.points_from_xy(rest.longitude, rest.latitude), crs=4326).to_crs(2263)
    rest['x'] = xy.x.values; rest['y'] = xy.y.values
    rest = rest.rename(columns={'unitsres': 'units'}); rest['bldg_units'] = rest.units
    pieces = pd.concat([nycha_pieces, pieces], ignore_index=True)
    allp = pd.concat([pieces, rest[['bbl', 'units', 'nycha', 'x', 'y', 'bct2020', 'bldg_units']]], ignore_index=True)
    assert abs(allp.units.sum() - total_units) < 1e-6 * total_units, 'units lost in the split'
    # place in EDs; lots with no point go by their 2020 census block's ED
    eds = gpd.read_file(f'{ROOT}/data/eds_attr.geojson').to_crs(2263)[['id', 'geometry']]
    has = allp.x.notna()
    pts = gpd.GeoDataFrame(allp[has], geometry=gpd.points_from_xy(allp.x[has], allp.y[has]), crs=2263)
    j = gpd.sjoin(pts, eds, predicate='within', how='left'); j = j[~j.index.duplicated()]
    miss = j.id.isna()
    if miss.any():
        near = gpd.sjoin_nearest(pts[miss], eds, how='left', distance_col='d'); near = near[~near.index.duplicated()]
        j.loc[miss, 'id'] = near.id; print('placed by nearest ED (shoreline points)', int(miss.sum()), 'max distance ft', round(near.d.max()))
    allp.loc[has, 'ed'] = j.id
    blocks = pyogrio.read_dataframe(f'zip://{ROOT}/raw/census/tl_2020_36_tabblock20.zip', read_geometry=False,
                                    columns=['GEOID20', 'COUNTYFP20', 'HOUSING20', 'POP20', 'INTPTLAT20', 'INTPTLON20'])
    blocks = blocks[blocks.COUNTYFP20.isin(['005', '047', '061', '081', '085'])]
    bp = gpd.GeoDataFrame(blocks, geometry=gpd.points_from_xy(blocks.INTPTLON20.astype(float), blocks.INTPTLAT20.astype(float)), crs=4326).to_crs(2263)
    bj = gpd.sjoin_nearest(bp, eds, how='left'); bj = bj[~bj.index.duplicated()]
    block_ed = dict(zip(bj.GEOID20, bj.id))
    BOROFIPS = {'MN': '061', 'BX': '005', 'BK': '047', 'QN': '081', 'SI': '085'}
    nopt = allp.ed.isna()
    if nopt.any():
        geo = rest.set_index('bbl').reindex(allp.bbl[nopt])
        keys = ['36' + BOROFIPS[b] + str(int(c))[1:].zfill(10) if pd.notna(c) else None for b, c in zip(geo.borough, geo.bctcb2020)]
        allp.loc[nopt, 'ed'] = [float(block_ed[k]) if k in block_ed else np.nan for k in keys]
    # last resort: geocode the lot's address with NYC GeoSearch and require the same borough and block (BBL)
    still = allp.ed.isna()
    if still.any():
        import urllib.request, urllib.parse
        cache_f = f'{OUT}/geocode_cache.json'; cache = json.load(open(cache_f)) if os.path.exists(cache_f) else {}
        info = p.set_index('bbl')
        BN = {'MN': 'Manhattan', 'BX': 'Bronx', 'BK': 'Brooklyn', 'QN': 'Queens', 'SI': 'Staten Island'}
        for i in allp.index[still]:
            b = allp.at[i, 'bbl']; r = info.loc[b]
            if not isinstance(r.address, str): continue
            q = f'{r.address}, {BN[r.borough]}, NY'
            if q not in cache:
                try: cache[q] = json.load(urllib.request.urlopen('https://geosearch.planninglabs.nyc/v2/search?size=5&text=' + urllib.parse.quote(q), timeout=30))['features']
                except Exception: cache[q] = None
            for f in cache[q] or []:
                pb = f['properties'].get('addendum', {}).get('pad', {}).get('bbl', '')
                if pb[:6] == b[:6]:       # same borough and tax block
                    x, y = gpd.GeoSeries(gpd.points_from_xy([f['geometry']['coordinates'][0]], [f['geometry']['coordinates'][1]]), crs=4326).to_crs(2263).iloc[0].coords[0]
                    allp.at[i, 'x'] = x; allp.at[i, 'y'] = y
                    hit = eds[eds.contains(gpd.points_from_xy([x], [y])[0])]
                    if len(hit): allp.at[i, 'ed'] = float(hit.id.iloc[0])
                    break
        json.dump(cache, open(cache_f, 'w'))
        print('placed by geocoding the lot address (same tax block)', int((still & allp.ed.notna()).sum()))
    # still nothing: the ED holding most units of the other lots on the same tax block
    left = allp.ed.isna()
    if left.any():
        placed = allp[~left].copy(); placed['blk'] = placed.bbl.str[:6]
        blk_ed = placed.groupby(['blk', 'ed']).units.sum().reset_index().sort_values('units').drop_duplicates('blk', keep='last').set_index('blk').ed
        allp.loc[left, 'ed'] = allp.bbl[left].str[:6].map(blk_ed)
        print('placed by the rest of their tax block', int((left & allp.ed.notna()).sum()))
    unplaced = allp.ed.isna()
    print('units placed by census block', int(allp.units[nopt & ~unplaced].sum()), 'unplaced lots', int(unplaced.sum()), 'units', allp.units[unplaced].sum())
    allp = allp[~unplaced]; allp['ed'] = allp.ed.astype(int)
    b = allp.bldg_units
    for k, m in [('u1_2', b <= 2.5), ('u3_9', (b > 2.5) & (b < 9.5)), ('u10_49', (b >= 9.5) & (b < 49.5)), ('u50', b >= 49.5)]: allp[k] = allp.units.where(m, 0)
    allp['nycha'] = allp.units.where(allp.nycha.astype(bool), 0); allp['bldgs'] = 1
    E = allp.groupby('ed')[COLS[:7]].sum()
    E = E.join(bj.groupby('id')[['POP20', 'HOUSING20']].sum().astype(float).rename(columns={'POP20': 'pop20', 'HOUSING20': 'hu20'}), how='outer').fillna(0)
    assert int(E.pop20.sum()) == int(blocks.POP20.astype(int).sum()), '2020 population lost'
    # check against the 2020 Census: housing units by ED from the same block placement
    hu = bj.groupby('id').HOUSING20.sum().astype(float)
    cmp = pd.DataFrame({'pluto': E.units, 'census2020': hu}).fillna(0)
    big = cmp[cmp.census2020 >= 200]
    ratio = big.pluto / big.census2020
    print('NYC units: PLUTO', round(allp.units.sum()), 'Census 2020 housing units', int(hu.sum()))
    print('EDs with 200+ census units: median PLUTO/Census', round(ratio.median(), 3), 'IQR', round(ratio.quantile(.25), 3), round(ratio.quantile(.75), 3),
          'within 25%', round(((ratio > .75) & (ratio < 1.25)).mean() * 100, 1), '% corr', round(np.corrcoef(cmp.pluto, cmp.census2020)[0, 1], 4))
    cmp['ratio'] = cmp.pluto / cmp.census2020.replace(0, np.nan)
    cmp.to_csv(f'{OUT}/check_vs_census2020_by_ed.csv', index_label='elect_dist')
    # levels: EDs nest in districts; tracts come straight from each lot's 2020 tract
    mem = gpd.read_file(f'{ROOT}/data/eds_attr.geojson').set_index('id')[['cc', 'ad', 'sd', 'cd', 'boro']]
    Ei = E.round(1)
    Ei.rename(columns=LABEL).to_csv(f'{OUT}/doors_ed.csv', index_label='elect_dist')
    for lvl, name in [('cc', 'council_district'), ('ad', 'assembly_district'), ('sd', 'senate_district'), ('cd', 'congressional_district'), ('boro', 'borough')]:
        E.join(mem).groupby(lvl)[COLS].sum().round(0).rename(columns=LABEL).to_csv(f'{OUT}/doors_{lvl}.csv', index_label=name)
    BOROF = {1: '061', 2: '005', 3: '047', 4: '081', 5: '085'}
    tracts = gpd.read_file(f'{ROOT}/raw/tracts2020.geojson').to_crs(2263)[['GEOID', 'geometry']]
    tr = allp.copy(); hp = tr.x.notna()
    tp = gpd.GeoDataFrame(tr[hp], geometry=gpd.points_from_xy(tr.x[hp], tr.y[hp]), crs=2263)
    jt = gpd.sjoin_nearest(tp, tracts, how='left'); jt = jt[~jt.index.duplicated()]
    tr.loc[hp, 'tract'] = jt.GEOID
    nb = ~hp & tr.bct2020.notna()
    tr.loc[nb, 'tract'] = ['36' + BOROF[int(str(int(t))[0])] + str(int(t))[1:].zfill(6) for t in tr.bct2020[nb]]
    nt = tr.tract.isna()
    if nt.any():                       # same tax block as other lots
        blk_tr = tr[~nt].assign(blk=lambda d: d.bbl.str[:6]).groupby(['blk', 'tract']).units.sum().reset_index().sort_values('units').drop_duplicates('blk', keep='last').set_index('blk').tract
        tr.loc[nt, 'tract'] = tr.bbl[nt].str[:6].map(blk_tr)
    assert tr.tract.notna().all(), 'lots without a tract'
    assert abs(tr.units.sum() - allp.units.sum()) < 1, 'tract totals do not add up to the city'
    T = tr.groupby('tract')[COLS[:7]].sum()
    bt = blocks.assign(tract=blocks.GEOID20.str[:11]).groupby('tract')[['POP20', 'HOUSING20']].sum().astype(float).rename(columns={'POP20': 'pop20', 'HOUSING20': 'hu20'})
    T = T.join(bt, how='outer').fillna(0).round(0)
    T.rename(columns=LABEL).to_csv(f'{OUT}/doors_tract.csv', index_label='tract_geoid')
    json.dump({'source': 'NYC DCP PLUTO 26v2; multi-building lots split by building footprint (NYC Open Data 5zhs-2jue)', 'fields': COLS,
               'ed': {str(k): [round(float(v), 1) for v in r] for k, r in E[COLS].iterrows()},
               'tract': {k: [int(v) for v in r] for k, r in T.iterrows()}},
              open(f'{SITE}/data/doors.json', 'w'), separators=(',', ':'))
    print('EDs with units', len(E), 'tracts', len(T), 'NYCHA units', round(allp.nycha.sum()))

if __name__ == '__main__':
    main()
