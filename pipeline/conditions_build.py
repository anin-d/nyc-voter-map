"""Neighborhood conditions by ED for one 12-month window (July 2025 to June 2026; NYPD's latest release ends June 30, 2026).

311 service requests by category, HPD housing violations by class, residential evictions, NYPD criminal complaints.
Each source is grouped on the server by location, then placed in EDs with the same ED map as the rest of the site.
Points that sit on an ED line (NYPD records are snapped to street centerlines and intersections, and ED lines run down
streets) are shared equally among the EDs within 25 feet, so no record is counted twice or dropped.
Outputs: site/data/conditions.json, data/conditions/conditions_<level>.csv, data/conditions/coverage.csv
"""
import os, re, json, time, urllib.parse, urllib.request
import numpy as np, pandas as pd, geopandas as gpd

ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); SITE = os.environ.get('SITE_DIR', f'{ROOT}/site')
RAW = f'{ROOT}/raw/conditions'; OUT = f'{ROOT}/data/conditions'; os.makedirs(RAW, exist_ok=True); os.makedirs(OUT, exist_ok=True)
START, END = '2025-07-01T00:00:00', '2026-06-30T23:59:59'
WINDOW = 'July 1, 2025 to June 30, 2026'
API = 'https://data.cityofnewyork.us/resource/'

CASE311 = ("case(starts_with(complaint_type,'Noise'),'noise', complaint_type='HEAT/HOT WATER','heat', agency='HPD','housing', "
           "complaint_type in('Rodent'),'rodent', complaint_type in('Illegal Parking','Blocked Driveway','Abandoned Vehicle','Derelict Vehicles'),'parking', "
           "complaint_type in('Homeless Person Assistance','Encampment'),'homeless', "
           "complaint_type in('Dirty Condition','Illegal Dumping','Missed Collection','Residential Disposal Complaint','Litter Basket Request','Litter Basket Complaint','Dead Animal','Graffiti'),'trash', "
           "complaint_type in('Street Condition','Sidewalk Condition','Street Light Condition','Traffic Signal Condition','Curb Condition','Highway Condition') or starts_with(complaint_type,'Street Sign'),'street', "
           "true,'other')")
VIOLENT = "ofns_desc in('MURDER & NON-NEGL. MANSLAUGHTER','RAPE','ROBBERY','FELONY ASSAULT')"
PROPERTY = "ofns_desc in('BURGLARY','GRAND LARCENY','GRAND LARCENY OF MOTOR VEHICLE')"
CASENYPD = f"case({VIOLENT},'violent', {PROPERTY},'property', law_cat_cd='FELONY','felony_other', law_cat_cd='MISDEMEANOR','misdemeanor', true,'violation')"

SOURCES = {
    '311': dict(id='erm2-nwe9', select=f'latitude, longitude, bbl, {CASE311} as cat, count(*) as n', where=f"created_date between '{START}' and '{END}'",
                group='latitude, longitude, bbl, cat', total=f"created_date between '{START}' and '{END}'"),
    'hpd': dict(id='wvxf-dwi5', select="latitude, longitude, bbl, class as cat, count(*) as n", where=f"novissueddate between '{START}' and '{END}'",
                group='latitude, longitude, bbl, cat', total=f"novissueddate between '{START}' and '{END}'"),
    'evict': dict(id='6z8x-wfk4', select="latitude, longitude, bbl, 'evict' as cat, count(*) as n",
                  where=f"executed_date between '{START}' and '{END}' and residential_commercial_ind='Residential'",
                  group='latitude, longitude, bbl, cat', total=f"executed_date between '{START}' and '{END}' and residential_commercial_ind='Residential'"),
    'nypd_hist': dict(id='qgea-i56i', select=f"latitude, longitude, {CASENYPD} as cat, count(*) as n",
                      where=f"cmplnt_fr_dt between '{START}' and '2025-12-31T23:59:59'", group='latitude, longitude, cat',
                      total=f"cmplnt_fr_dt between '{START}' and '2025-12-31T23:59:59'"),
    'nypd_ytd': dict(id='5uac-w243', select=f"latitude, longitude, {CASENYPD} as cat, count(*) as n",
                     where=f"cmplnt_fr_dt between '2026-01-01T00:00:00' and '{END}'", group='latitude, longitude, cat',
                     total=f"cmplnt_fr_dt between '2026-01-01T00:00:00' and '{END}'"),
}

def get(id_, params):
    url = API + id_ + '.json?' + urllib.parse.urlencode(params)
    for k in range(10):
        try:
            return json.load(urllib.request.urlopen(url, timeout=600))
        except Exception as e:
            time.sleep(min(60, 5 * (k + 1)))
    raise RuntimeError('failed: ' + url[:200])

def months(a, b):
    """month windows [start, end) covering a..b"""
    out, y, m = [], int(a[:4]), int(a[5:7])
    while f'{y:04d}-{m:02d}' <= b[:7]:
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        out.append((f'{y:04d}-{m:02d}-01T00:00:00', f'{ny:04d}-{nm:02d}-01T00:00:00')); y, m = ny, nm
    return out

def fetch(name, s):
    """grouped rows for one source; each month is fetched on its own (in parallel) and the groups are summed"""
    f = f'{RAW}/{name}.parquet'
    if os.path.exists(f): return pd.read_parquet(f)
    from concurrent.futures import ThreadPoolExecutor
    datecol = s['where'].split(' between ')[0].strip()
    lo = s['where'].split("between '")[1][:19]; hi = s['where'].split("and '")[1][:19]
    extra = s['where'].split(f"and '{hi}'")[1]
    def one(win):
        a, b = max(win[0], lo), win[1]
        where = f"{datecol} >= '{a}' and {datecol} < '{b}' and {datecol} <= '{hi}'{extra}"
        rows, off, page = [], 0, 50000
        while True:
            d = get(s['id'], {'$select': s['select'], '$where': where, '$group': s['group'], '$order': s['group'], '$limit': page, '$offset': off})
            rows += d; off += page
            if len(d) < page: break
        tot = int(get(s['id'], {'$select': 'count(*) as n', '$where': where})[0]['n'])
        return rows, tot
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(one, months(lo, hi)))
    df = pd.DataFrame([r for rows, _ in res for r in rows])
    for c in ['latitude', 'longitude', 'n']:
        if c in df: df[c] = pd.to_numeric(df[c], errors='coerce')
    tot = sum(t for _, t in res)
    whole = int(get(s['id'], {'$select': 'count(*) as n', '$where': s['total']})[0]['n'])
    assert tot == whole, f'{name}: months add to {tot}, whole window has {whole}'
    df.to_parquet(f); json.dump({'total': tot}, open(f'{RAW}/{name}.total.json', 'w'))
    return df

def geocode_evictions(df, s):
    """Evictions the city left without a location: geocode the address with NYC GeoSearch, same borough and ZIP required."""
    f = f'{RAW}/evict_geocoded.parquet'
    if not os.path.exists(f):
        rows = get(s['id'], {'$select': 'eviction_address, borough, eviction_zip, count(*) as n', '$where': s['where'] + ' and latitude IS NULL',
                             '$group': 'eviction_address, borough, eviction_zip', '$limit': 50000})
        out = []
        for r in rows:
            q = f"{r.get('eviction_address', '')}, {str(r.get('borough', '')).title()}, NY {r.get('eviction_zip', '')}".strip()
            feats = None
            for k in range(4):
                try: feats = json.load(urllib.request.urlopen('https://geosearch.planninglabs.nyc/v2/search?size=3&text=' + urllib.parse.quote(q), timeout=30))['features']; break
                except Exception: time.sleep(2 * (k + 1))
            hit = None
            addr = re.sub(r'(\d+)(ST|ND|RD|TH)\b', r'\1', str(r.get('eviction_address', '')).upper())
            num = re.match(r'^\s*([\d-]+[A-Z]?)', addr)
            toks = set(re.findall(r'[A-Z0-9]+', addr))
            for ft in feats or []:
                pr = ft['properties']
                if str(pr.get('borough', '')).upper() != str(r.get('borough', '')).upper() or str(pr.get('postalcode', '')) != str(r.get('eviction_zip', '')): continue
                hn = str(pr.get('housenumber', '')).replace(' ', '')
                if not num or hn.replace('-', '') != num.group(1).replace('-', ''): continue
                sw = [w for w in re.findall(r'[A-Z0-9]+', str(pr.get('street', '')).upper()) if w not in ('STREET', 'AVENUE', 'ROAD', 'PLACE', 'BOULEVARD', 'DRIVE', 'LANE', 'EAST', 'WEST', 'NORTH', 'SOUTH', 'GAR')]
                if sw and sw[0] in toks: hit = ft; break
            out.append({'latitude': hit['geometry']['coordinates'][1] if hit else None, 'longitude': hit['geometry']['coordinates'][0] if hit else None,
                        'bbl': (hit['properties'].get('addendum', {}).get('pad', {}).get('bbl') if hit else None), 'cat': 'evict', 'n': int(r['n'])})
        pd.DataFrame(out).to_parquet(f)
    g = pd.read_parquet(f)
    print('evictions without a location in the source:', int(g.n.sum()), 'geocoded by address:', int(g.n[g.latitude.notna()].sum()))
    keep = df[df.latitude.notna() | df.bbl.notna()]
    return pd.concat([keep, g[keep.columns.intersection(g.columns)]], ignore_index=True)

def main():
    eds = gpd.read_file(f'{ROOT}/data/eds_attr.geojson').to_crs(2263)[['id', 'geometry']]
    bounds = eds.copy(); bounds['geometry'] = eds.boundary
    pl = pd.read_csv(f'{ROOT}/raw/pluto/pluto_26v2.csv', low_memory=False, usecols=['bbl', 'latitude', 'longitude'])
    pl = pl.dropna(); pl['bbl'] = pl.bbl.astype('int64').astype(str); plx = pl.set_index('bbl')
    pieces, cover = [], []
    for name, s in SOURCES.items():
        df = fetch(name, s)
        if name == 'evict': df = geocode_evictions(df, s)
        total = json.load(open(f'{RAW}/{name}.total.json'))['total']
        assert int(df.n.sum()) == total, f'{name}: grouped rows add to {int(df.n.sum())}, source has {total}'
        # records with a tax lot go to the lot's own point (inside the lot, so clearly on one side of any street);
        # the rest keep their coordinates
        df['lot'] = False
        if 'bbl' in df:
            b = df.bbl.astype(str).str.replace(r'\.0$', '', regex=True)
            has = b.isin(plx.index)
            df.loc[has, 'latitude'] = b[has].map(plx.latitude); df.loc[has, 'longitude'] = b[has].map(plx.longitude); df.loc[has, 'lot'] = True
        ok = df.latitude.notna() & df.longitude.notna() & (df.latitude.between(40.4, 41.0)) & (df.longitude.between(-74.3, -73.6))
        pts = gpd.GeoDataFrame(df[ok].reset_index(drop=True), geometry=gpd.points_from_xy(df.longitude[ok], df.latitude[ok]), crs=4326).to_crs(2263)
        pts['pid'] = pts.index
        # street-snapped points (no lot) within 25 ft of an ED line are shared equally among the EDs there
        st = pts[~pts.lot]
        near = gpd.sjoin(st[['pid', 'geometry']], bounds, predicate='dwithin', distance=25)[['pid', 'id']]
        inside = gpd.sjoin(pts[['pid', 'geometry']], eds, predicate='within', how='left')[['pid', 'id']]
        inside = inside[~inside.pid.duplicated()]
        far = inside[~inside.pid.isin(near.pid)]
        out_of_map = far.id.isna()
        if out_of_map.any():      # piers and shoreline points just outside the ED map
            nn = gpd.sjoin_nearest(pts.loc[far.pid[out_of_map], ['pid', 'geometry']], eds, max_distance=500)[['pid', 'id']]
            nn = nn[~nn.pid.duplicated()]
            far = pd.concat([far[~out_of_map], nn])
        asg = pd.concat([near, far.dropna()]).drop_duplicates()
        asg['w'] = 1 / asg.groupby('pid').id.transform('size')
        a = asg.merge(pts[['pid', 'cat', 'n']], on='pid')
        a['n'] = a.n * a.w
        placed = a.n.sum()
        cover.append(dict(source=name, records=total, placed=round(placed), no_location=int(df.n[~ok].sum()),
                          outside_city=round(total - placed - df.n[~ok].sum()), pct_placed=round(placed / total * 100, 2),
                          pct_on_ed_line=round(a[a.w < 1].n.sum() / placed * 100, 2), pct_by_tax_lot=round(float(df.n[df.lot].sum()) / total * 100, 2)))
        a['src'] = 'nypd' if name.startswith('nypd') else name
        pieces.append(a[['id', 'src', 'cat', 'n']])
    P = pd.concat(pieces)
    P['key'] = P.src + '_' + P.cat.astype(str).str.lower()
    E = P.pivot_table(index='id', columns='key', values='n', aggfunc='sum').fillna(0)
    # rolled-up columns
    E['311_total'] = E[[c for c in E if c.startswith('311_')]].sum(axis=1)
    E['hpd_total'] = E[[c for c in E if c.startswith('hpd_') and c != 'hpd_total']].sum(axis=1)
    E['nypd_felony'] = E[['nypd_violent', 'nypd_property', 'nypd_felony_other']].sum(axis=1)
    E['nypd_total'] = E[['nypd_felony', 'nypd_misdemeanor', 'nypd_violation']].sum(axis=1)
    COLS = ['311_total', '311_noise', '311_heat', '311_housing', '311_street', '311_trash', '311_rodent', '311_parking', '311_homeless',
            'hpd_total', 'hpd_c', 'hpd_b', 'hpd_a', 'evict_evict', 'nypd_total', 'nypd_felony', 'nypd_violent', 'nypd_property', 'nypd_misdemeanor']
    for c in COLS:
        if c not in E: E[c] = 0.0
    allids = gpd.read_file(f'{ROOT}/data/eds_attr.geojson').id.astype(int)
    E = E.reindex(allids).fillna(0)[COLS]
    cov = pd.DataFrame(cover); cov.to_csv(f'{OUT}/coverage.csv', index=False); print(cov.to_string())
    mem = gpd.read_file(f'{ROOT}/data/eds_attr.geojson').set_index('id')[['cc', 'ad', 'sd', 'cd', 'boro']]
    E.round(2).to_csv(f'{OUT}/conditions_ed.csv', index_label='elect_dist')
    for lvl, nm in [('cc', 'council_district'), ('ad', 'assembly_district'), ('sd', 'senate_district'), ('cd', 'congressional_district'), ('boro', 'borough')]:
        E.join(mem).groupby(lvl)[COLS].sum().round(1).to_csv(f'{OUT}/conditions_{lvl}.csv', index_label=nm)
    json.dump({'window': WINDOW, 'start': START[:10], 'end': END[:10], 'fields': COLS, 'coverage': cover,
               'ed': {str(k): [round(float(v), 2) for v in r] for k, r in E.iterrows()}},
              open(f'{SITE}/data/conditions.json', 'w'), separators=(',', ':'))
    print('citywide', E.sum().round(0).to_dict())

if __name__ == '__main__':
    main()
