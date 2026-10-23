"""Neighborhood conditions by election district, pulled straight from NYC Open Data's API.

Each run asks the API how current each source is, takes the latest 12 complete months for that source, and rebuilds
site/data/conditions.json. Run it by hand or on a schedule (.github/workflows/conditions.yml runs it weekly).

Sources (NYC Open Data / Socrata):
  311 service requests (erm2-nwe9), by category
  HPD housing maintenance code violations (wvxf-dwi5), by class, by date issued
  Marshals' residential evictions (6z8x-wfk4), by date executed
  NYPD complaints: historic (qgea-i56i) for earlier years, year to date (5uac-w243) for the current year

Placement:
  A record with a city tax lot (BBL) goes to the election district holding that lot (ref/lot_ed.csv.gz, built from PLUTO
  lot points). Other records use their coordinates; NYPD points sit on street centerlines and corners, and ED lines run
  down streets, so a point within 25 feet of an ED line is shared equally among the EDs there. Evictions the city left
  without a location are geocoded by address (NYC GeoSearch), requiring the same borough, ZIP, house number and street.

Safety: every grouped pull must add up to the API's own count for the window, and a run that finds far fewer records
than the last published file stops without writing (an API outage should never blank the map).
Outputs: site/data/conditions.json, data/conditions/conditions_<level>.csv, data/conditions/coverage.csv
"""
import os, re, sys, json, time, calendar, datetime as dt, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np, pandas as pd, geopandas as gpd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(HERE))
SITE = os.environ.get('SITE_DIR', f'{ROOT}/site')
REF = os.environ.get('REF_DIR', f'{HERE}/ref')
OUT = f'{ROOT}/data/conditions'
API = 'https://data.cityofnewyork.us/resource/'
TOKEN = os.environ.get('SOCRATA_APP_TOKEN', '')   # optional; raises the API's rate limit
TODAY = dt.date.fromisoformat(os.environ['CONDITIONS_TODAY']) if os.environ.get('CONDITIONS_TODAY') else dt.date.today()

CASE311 = ("case(starts_with(complaint_type,'Noise'),'noise', complaint_type='HEAT/HOT WATER','heat', agency='HPD','housing', "
           "complaint_type in('Rodent'),'rodent', complaint_type in('Illegal Parking','Blocked Driveway','Abandoned Vehicle','Derelict Vehicles'),'parking', "
           "complaint_type in('Homeless Person Assistance','Encampment'),'homeless', "
           "complaint_type in('Dirty Condition','Illegal Dumping','Missed Collection','Residential Disposal Complaint','Litter Basket Request','Litter Basket Complaint','Dead Animal','Graffiti'),'trash', "
           "complaint_type in('Street Condition','Sidewalk Condition','Street Light Condition','Traffic Signal Condition','Curb Condition','Highway Condition') or starts_with(complaint_type,'Street Sign'),'street', "
           "true,'other')")
VIOLENT = "ofns_desc in('MURDER & NON-NEGL. MANSLAUGHTER','RAPE','ROBBERY','FELONY ASSAULT')"
PROPERTY = "ofns_desc in('BURGLARY','GRAND LARCENY','GRAND LARCENY OF MOTOR VEHICLE')"
CASENYPD = f"case({VIOLENT},'violent', {PROPERTY},'property', law_cat_cd='FELONY','felony_other', law_cat_cd='MISDEMEANOR','misdemeanor', true,'violation')"
# family -> datasets that feed it; each dataset: id, date column, select, group, extra filter, whether it has a BBL
FAMILIES = {
    '311': {'label': '311 service requests', 'parts': [dict(id='erm2-nwe9', col='created_date', select=f'latitude, longitude, bbl, {CASE311} as cat', group='latitude, longitude, bbl, cat', extra='')]},
    'hpd': {'label': 'HPD housing code violations', 'parts': [dict(id='wvxf-dwi5', col='novissueddate', select='latitude, longitude, bbl, class as cat', group='latitude, longitude, bbl, cat', extra='')]},
    'evict': {'label': 'Residential evictions', 'parts': [dict(id='6z8x-wfk4', col='executed_date', select="latitude, longitude, bbl, 'evict' as cat", group='latitude, longitude, bbl, cat', extra=" and residential_commercial_ind='Residential'")]},
    'nypd': {'label': 'NYPD crime complaints', 'parts': [dict(id='qgea-i56i', col='cmplnt_fr_dt', select=f'latitude, longitude, {CASENYPD} as cat', group='latitude, longitude, cat', extra='', role='historic'),
                                                         dict(id='5uac-w243', col='cmplnt_fr_dt', select=f'latitude, longitude, {CASENYPD} as cat', group='latitude, longitude, cat', extra='', role='ytd')]},
}
COLS = ['311_total', '311_noise', '311_heat', '311_housing', '311_street', '311_trash', '311_rodent', '311_parking', '311_homeless',
        'hpd_total', 'hpd_c', 'hpd_b', 'hpd_a', 'evict_evict', 'nypd_total', 'nypd_felony', 'nypd_violent', 'nypd_property', 'nypd_misdemeanor']

def get(id_, params, tries=10):
    url = API + id_ + '.json?' + urllib.parse.urlencode(params)
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={'X-App-Token': TOKEN} if TOKEN else {})
            return json.load(urllib.request.urlopen(req, timeout=600))
        except Exception:
            if k == tries - 1: raise
            time.sleep(min(60, 5 * (k + 1)))

def latest(part):
    d = get(part['id'], {'$select': f"max({part['col']}) as m", '$where': f"{part['col']} <= '{TODAY.isoformat()}T23:59:59'{part['extra']}"})
    return dt.datetime.fromisoformat(d[0]['m'][:19])

def month_end(y, m): return dt.date(y, m, calendar.monthrange(y, m)[1])
def window_for(maxdate):
    """the latest 12 complete months: a month counts as complete when the data reaches its last day"""
    d = maxdate.date()
    end = month_end(d.year, d.month) if d == month_end(d.year, d.month) else (dt.date(d.year, d.month, 1) - dt.timedelta(days=1))
    sm, sy = end.month - 11, end.year
    if sm <= 0: sm += 12; sy -= 1
    start = dt.date(sy, sm, 1)
    return start, end

def months(a, b):
    out, y, m = [], a.year, a.month
    while (y, m) <= (b.year, b.month):
        ny, nm = (y + 1, 1) if m == 12 else (y, m + 1)
        out.append((dt.date(y, m, 1), dt.date(ny, nm, 1))); y, m = ny, nm
    return out

def pull(part, a, b, cache):
    """grouped rows for one dataset over [a, b]; months run in parallel and must add up to the API's own count"""
    f = f"{cache}/{part['id']}_{a}_{b}_pulled{TODAY}.parquet"   # reused only within the same day; late records still count
    if os.path.exists(f): return pd.read_parquet(f)
    col = part['col']
    def one(win):
        lo, hi = max(win[0], a), min(win[1], b + dt.timedelta(days=1))
        where = f"{col} >= '{lo}T00:00:00' and {col} < '{hi}T00:00:00'{part['extra']}"
        rows, off, page = [], 0, 50000
        while True:
            d = get(part['id'], {'$select': part['select'] + ', count(*) as n', '$where': where, '$group': part['group'], '$order': part['group'], '$limit': page, '$offset': off})
            rows += d; off += page
            if len(d) < page: break
        tot = int(get(part['id'], {'$select': 'count(*) as n', '$where': where})[0]['n'])
        got = sum(int(r['n']) for r in rows)
        assert got == tot, f"{part['id']} {lo}..{hi}: grouped rows add to {got}, API count is {tot}"
        return rows, tot
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(one, months(a, b)))
    df = pd.DataFrame([r for rows, _ in res for r in rows])
    if df.empty: df = pd.DataFrame(columns=['latitude', 'longitude', 'cat', 'n'])
    for c in ['latitude', 'longitude', 'n']: df[c] = pd.to_numeric(df[c], errors='coerce')
    df.attrs['total'] = sum(t for _, t in res)
    df.to_parquet(f)
    return df

def geocode_unlocated_evictions(part, a, b):
    """Evictions the city left without a location or lot: geocode the address (same borough, ZIP, house number and street)."""
    cache_f = f'{REF}/evict_geocode_cache.json'
    cache = json.load(open(cache_f)) if os.path.exists(cache_f) else {}
    rows = get(part['id'], {'$select': 'eviction_address, borough, eviction_zip, count(*) as n', '$limit': 50000, '$group': 'eviction_address, borough, eviction_zip',
                            '$where': f"{part['col']} >= '{a}T00:00:00' and {part['col']} <= '{b}T23:59:59'{part['extra']} and latitude IS NULL and bbl IS NULL"})
    out = []
    for r in rows:
        q = f"{r.get('eviction_address', '')}, {str(r.get('borough', '')).title()}, NY {r.get('eviction_zip', '')}".strip()
        if q not in cache:
            feats = []
            for k in range(4):
                try: feats = json.load(urllib.request.urlopen('https://geosearch.planninglabs.nyc/v2/search?size=3&text=' + urllib.parse.quote(q), timeout=30))['features']; break
                except Exception: time.sleep(2 * (k + 1))
            addr = re.sub(r'(\d+)(ST|ND|RD|TH)\b', r'\1', str(r.get('eviction_address', '')).upper())
            num = re.match(r'^\s*([\d-]+[A-Z]?)', addr)
            toks = set(re.findall(r'[A-Z0-9]+', addr))
            hit = None
            for ft in feats:
                pr = ft['properties']
                if str(pr.get('borough', '')).upper() != str(r.get('borough', '')).upper() or str(pr.get('postalcode', '')) != str(r.get('eviction_zip', '')): continue
                if not num or str(pr.get('housenumber', '')).replace(' ', '').replace('-', '') != num.group(1).replace('-', ''): continue
                sw = [w for w in re.findall(r'[A-Z0-9]+', str(pr.get('street', '')).upper()) if w not in ('STREET', 'AVENUE', 'ROAD', 'PLACE', 'BOULEVARD', 'DRIVE', 'LANE', 'EAST', 'WEST', 'NORTH', 'SOUTH', 'GAR')]
                if sw and sw[0] in toks: hit = ft; break
            cache[q] = [hit['geometry']['coordinates'][1], hit['geometry']['coordinates'][0], hit['properties'].get('addendum', {}).get('pad', {}).get('bbl')] if hit else None
        v = cache[q]
        out.append({'latitude': v[0] if v else None, 'longitude': v[1] if v else None, 'bbl': v[2] if v else None, 'cat': 'evict', 'n': int(r['n'])})
    json.dump(cache, open(cache_f, 'w'), indent=0, sort_keys=True)
    g = pd.DataFrame(out, columns=['latitude', 'longitude', 'bbl', 'cat', 'n'])
    print(f'  evictions with no location or lot in the source: {int(g.n.sum())}; placed by address: {int(g.n[g.latitude.notna()].sum())}')
    return g

def place(df, lots, eds, bounds):
    """records -> (ed, weight) rows; returns assignments and counts of how records were placed"""
    df = df.copy(); df['ed_lot'] = np.nan
    if 'bbl' in df:
        b = pd.to_numeric(df.bbl.astype(str).str.replace(r'\.0$', '', regex=True), errors='coerce')
        df['ed_lot'] = b.map(lots)
    by_lot = df.ed_lot.notna()
    ok = ~by_lot & df.latitude.between(40.4, 41.0) & df.longitude.between(-74.3, -73.6)
    pts = gpd.GeoDataFrame(df[ok].reset_index(drop=True), geometry=gpd.points_from_xy(df.longitude[ok], df.latitude[ok]), crs=4326).to_crs(2263)
    pts['pid'] = pts.index
    near = gpd.sjoin(pts[['pid', 'geometry']], bounds, predicate='dwithin', distance=25)[['pid', 'id']]
    inside = gpd.sjoin(pts[['pid', 'geometry']], eds, predicate='within', how='left')[['pid', 'id']]
    inside = inside[~inside.pid.duplicated()]
    far = inside[~inside.pid.isin(near.pid)]
    out_of_map = far.id.isna()
    if out_of_map.any():      # piers and shoreline points just outside the ED map
        nn = gpd.sjoin_nearest(pts.loc[far.pid[out_of_map], ['pid', 'geometry']], eds, max_distance=500)[['pid', 'id']]
        far = pd.concat([far[~out_of_map], nn[~nn.pid.duplicated()]])
    asg = pd.concat([near, far.dropna()]).drop_duplicates()
    asg['w'] = 1 / asg.groupby('pid').id.transform('size')
    a1 = asg.merge(pts[['pid', 'cat', 'n']], on='pid'); a1['n'] = a1.n * a1.w
    a2 = df[by_lot][['ed_lot', 'cat', 'n']].rename(columns={'ed_lot': 'id'}).assign(w=1.0)
    A = pd.concat([a1[['id', 'cat', 'n', 'w']], a2], ignore_index=True)
    stats = dict(by_tax_lot=float(df.n[by_lot].sum()), by_location=float(a1.n.sum()), on_ed_line=float(a1[a1.w < 1].n.sum()), no_location=float(df.n[~by_lot & ~ok].sum()))
    return A, stats

def main():
    os.makedirs(OUT, exist_ok=True)
    cache = os.environ.get('CONDITIONS_CACHE', f'{ROOT}/raw/conditions_cache'); os.makedirs(cache, exist_ok=True)
    eds = gpd.read_file(f'/vsigzip/{REF}/eds.geojson.gz').to_crs(2263)[['id', 'geometry', 'cc', 'ad', 'sd', 'cd', 'boro']]
    bounds = eds[['id']].copy(); bounds['geometry'] = eds.boundary; bounds = gpd.GeoDataFrame(bounds, geometry='geometry', crs=2263)
    lots = pd.read_csv(f'{REF}/lot_ed.csv.gz').set_index('bbl').ed
    prev = json.load(open(f'{SITE}/data/conditions.json')) if os.path.exists(f'{SITE}/data/conditions.json') else {}
    pieces, cover, windows = [], [], {}
    for fam, spec in FAMILIES.items():
        parts = spec['parts']
        if fam == 'nypd':
            hist, ytd = parts
            mx = latest(ytd)
            a, b = window_for(mx)
            jan1 = dt.date(b.year, 1, 1)
            dfs = []
            if a < jan1:
                hmax = latest(hist).date()
                assert hmax >= jan1 - dt.timedelta(days=1), f'NYPD historic data ends {hmax}; it should reach {jan1 - dt.timedelta(days=1)} before the year-to-date file takes over'
                dfs.append(pull(hist, a, jan1 - dt.timedelta(days=1), cache))
            dfs.append(pull(ytd, max(a, jan1), b, cache))
            total = sum(d.attrs.get('total', int(d.n.sum())) for d in dfs)
            df = pd.concat(dfs, ignore_index=True)
        else:
            part = parts[0]
            a, b = window_for(latest(part))
            df = pull(part, a, b, cache)
            total = df.attrs.get('total', int(df.n.sum()))
            if fam == 'evict':   # replace rows with neither coordinates nor a lot by their geocoded addresses
                g = geocode_unlocated_evictions(part, a, b)
                none = df.latitude.isna() & df.bbl.isna()
                assert abs(df.n[none].sum() - g.n.sum()) < 1, 'unlocated evictions do not match the address pull'
                df = pd.concat([df[~none], g], ignore_index=True)
        assert int(df.n.sum()) == total, f'{fam}: rows add to {int(df.n.sum())}, API count is {total}'
        old = (prev.get('sources') or {}).get(fam, {}).get('records')
        if old and total < 0.6 * old:
            sys.exit(f'{fam}: only {total:,} records this run against {old:,} last time. Not publishing; check the API and rerun.')
        A, st = place(df, lots, eds[['id', 'geometry']], bounds)
        placed = A.n.sum()
        windows[fam] = dict(label=spec['label'], start=a.isoformat(), end=b.isoformat(), records=int(total), placed=round(float(placed)),
                            pct_placed=round(placed / total * 100, 2) if total else 0, pct_by_tax_lot=round(st['by_tax_lot'] / total * 100, 2) if total else 0,
                            pct_on_ed_line=round(st['on_ed_line'] / total * 100, 2) if total else 0, no_location=round(st['no_location']))
        print(f"{fam:6s} {a} to {b}: {total:,} records, {windows[fam]['pct_placed']}% placed ({windows[fam]['pct_by_tax_lot']}% by tax lot, {windows[fam]['pct_on_ed_line']}% shared on an ED line)")
        A['key'] = fam + '_' + A.cat.astype(str).str.lower()
        pieces.append(A[['id', 'key', 'n']])
    P = pd.concat(pieces)
    E = P.pivot_table(index='id', columns='key', values='n', aggfunc='sum').fillna(0)
    E['311_total'] = E[[c for c in E if c.startswith('311_')]].sum(axis=1)
    E['hpd_total'] = E[[c for c in E if c.startswith('hpd_') and c != 'hpd_total']].sum(axis=1)
    for c in ['nypd_violent', 'nypd_property', 'nypd_felony_other', 'nypd_misdemeanor', 'nypd_violation']:
        if c not in E: E[c] = 0.0
    E['nypd_felony'] = E[['nypd_violent', 'nypd_property', 'nypd_felony_other']].sum(axis=1)
    E['nypd_total'] = E[['nypd_felony', 'nypd_misdemeanor', 'nypd_violation']].sum(axis=1)
    for c in COLS:
        if c not in E: E[c] = 0.0
    E.index = E.index.astype(int)
    E = E.reindex(eds.id.astype(int)).fillna(0)[COLS]
    # every placed record lands in exactly one row: ED sums equal what was placed
    for fam in windows:
        s = E[[c for c in COLS if c.startswith(fam + '_') and c not in ('311_total', 'hpd_total', 'nypd_total', 'nypd_felony')]].sum().sum() if fam != 'nypd' else E.nypd_total.sum()
        if fam == '311': s = E['311_total'].sum()
        if fam == 'hpd': s = E['hpd_total'].sum()
        assert abs(s - windows[fam]['placed']) <= 1, f'{fam}: ED sums {s} vs placed {windows[fam]["placed"]}'
    pd.DataFrame([dict(source=k, **v) for k, v in windows.items()]).to_csv(f'{OUT}/coverage.csv', index=False)
    mem = eds.set_index('id')[['cc', 'ad', 'sd', 'cd', 'boro']]
    E.round(2).to_csv(f'{OUT}/conditions_ed.csv', index_label='elect_dist')
    for lvl, nm in [('cc', 'council_district'), ('ad', 'assembly_district'), ('sd', 'senate_district'), ('cd', 'congressional_district'), ('boro', 'borough')]:
        E.join(mem).groupby(lvl)[COLS].sum().round(1).to_csv(f'{OUT}/conditions_{lvl}.csv', index_label=nm)
    json.dump({'updated': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'), 'sources': windows, 'fields': COLS,
               'ed': {str(k): [round(float(v), 2) for v in r] for k, r in E.iterrows()}},
              open(f'{SITE}/data/conditions.json', 'w'), separators=(',', ':'))
    print('wrote', f'{SITE}/data/conditions.json')

if __name__ == '__main__':
    main()
