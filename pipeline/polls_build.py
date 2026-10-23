"""Poll sites for the Nov 3, 2026 general election, by ED, geocoded with NYC GeoSearch and checked for distance."""
import os, re, json, time, urllib.parse, urllib.request
import numpy as np, pandas as pd, geopandas as gpd
from concurrent.futures import ThreadPoolExecutor
ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); SITE = os.environ.get('SITE_DIR', f'{ROOT}/site')
OUT = f'{ROOT}/data/polls'; os.makedirs(OUT, exist_ok=True)
CACHE = f'{OUT}/geocode_cache.json'
BORO_CODE = {'Manhattan': '1', 'Bronx': '2', 'Brooklyn': '3', 'Queens': '4', 'Staten Island': '5'}

KEEP = {'PS','IS','MS','JHS','HS','CS','IHS','NYCHA','YMCA','YWCA','CUNY','SUNY','UFT','NYPL','BMCC','NYC','UMC','AME','RC','LLC','HDFC','JCC','PAL','NAACP','LGBT','LIC','USA','NY','CSI','CYO','VFW','HRA','NYPD','FDNY','PSAL'}
SMALL = {'of','and','the','at','for','in','on'}
def piece(x, first):
    u = x.upper(); core = re.sub(r'[^A-Z]', '', u)
    if re.match(r'^\d', x): return x.lower()
    if core in KEEP or re.fullmatch(r'(PS|IS|MS|HS|JHS|CS|IHS)\d+[A-Z]?', u) or (re.fullmatch(r'[IVX]+', core) and not first and len(core) <= 4): return u
    if not first and x.lower() in SMALL: return x.lower()
    return '/'.join(y.capitalize() for y in x.lower().split('/'))
def nice(s):
    """BOE lists are in capitals; 'PS 82-HAMMOND' -> 'PS 82-Hammond', '1199 HOUSING III' -> '1199 Housing III'"""
    return ' '.join('-'.join(piece(x, i == 0 and j == 0) for j, x in enumerate(w.split('-'))) for i, w in enumerate(str(s).split()))

def clean_addr(a):
    a = re.sub(r'\s+', ' ', a).strip()
    a = re.sub(r'\b(\d+)\s+(ST|STREET|AVE|AVENUE|PL|PLACE|RD|ROAD|DR|DRIVE)\b', lambda m: m.group(0), a)
    return a

ORD = lambda n: n + ('th' if 10 <= int(n) % 100 <= 20 else {'1': 'st', '2': 'nd', '3': 'rd'}.get(n[-1], 'th'))
SUFFIX = {'ST', 'STREET', 'AVE', 'AVENUE', 'AV', 'RD', 'ROAD', 'PL', 'PLACE', 'BLVD', 'BOULEVARD', 'DR', 'DRIVE', 'LN', 'LANE', 'PKWY', 'PARKWAY',
          'TER', 'TERR', 'TERRACE', 'CT', 'COURT', 'SQ', 'SQUARE', 'WAY', 'LOOP', 'CRESCENT', 'HWY', 'PLZ', 'PLAZA', 'THE'}
DIRS = {'E': 'EAST', 'W': 'WEST', 'N': 'NORTH', 'S': 'SOUTH'}
def street_key(s, house=False):
    """significant words of a street name, so '21-27 HIMROD STREET' never matches '21-27 27 STREET'"""
    s = s.upper()
    if house: s = re.sub(r'^[\dA-Z]*\d[\dA-Z-]*\s+', '', s)
    s = re.sub(r'(\d+)(ST|ND|RD|TH)\b', r'\1', s)
    s = re.sub(r'\bAVE?\b', 'AVENUE', s.replace('BWAY', 'BROADWAY')).replace('SAINT ', 'ST ').replace('FT ', 'FORT ').replace('METRO ', 'METROPOLITAN ').replace('REV ', 'REVEREND ')
    ws = re.findall(r'[A-Z0-9]+', s)
    ws = [DIRS.get(w, w) if i < len(ws) - 1 and not (i and ws[i - 1] in ('AVENUE', 'AVE', 'AV')) else w for i, w in enumerate(ws)]
    keep = [w for w in ws if w not in SUFFIX or (w in ('AVENUE', 'AVE', 'AV') and len(ws) == 2 and len(ws[1]) == 1)]
    return keep or ws
# addresses the city's address file does not hold, placed by hand (each checked against the building it names)
MANUAL = {'343 60 STREET': '330 59 STREET'}   # PS 503/506/314 campus: a through-block lot, 59th St frontage is in the address file
def variants(a):
    out = [a] + ([MANUAL[a]] if a in MANUAL else [])
    b = re.sub(r'\b(\d+)\s+(STREET|ST|AVENUE|AVE|ROAD|RD|PLACE|PL|DRIVE|DR)\b', lambda m: ORD(m.group(1)) + ' ' + m.group(2), a); out.append(b)
    out.append(re.sub(r'^(\d+)-\d+\s', r'\1 ', a))                       # 231-249 EAST 56 -> 231 EAST 56
    out.append(re.sub(r'^(\d+)-(\d+)\s', r'\1\2 ', a))                    # 101-24 SEAVIEW -> 10124 SEAVIEW
    out.append(re.sub(r'\b(\d+)(ST|ND|RD|TH)\b', lambda m: ORD(m.group(1)), a.replace('BWAY', 'BROADWAY')))
    out.append(a.replace('METRO AVE', 'METROPOLITAN AVENUE').replace('SHORE FRONT', 'SHORE FRONT PARKWAY').replace('PARKWAY PARKWAY', 'PARKWAY'))
    return list(dict.fromkeys(out))

def geocode(q):
    url = 'https://geosearch.planninglabs.nyc/v2/search?size=5&text=' + urllib.parse.quote(q)
    for k in range(4):
        try:
            return json.load(urllib.request.urlopen(url, timeout=30))['features']
        except Exception as e:
            time.sleep(2 * (k + 1))
    return None

def main():
    d = pd.read_csv(f'{ROOT}/data/polls_raw.csv')
    d['address'] = d.address.map(clean_addr)
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    keys = sorted({(a, b) for a, b in zip(d.address, d.boro)})
    todo = [(v, k[1]) for k in keys for v in variants(k[0]) if f'{v}|{k[1]}' not in cache]
    with ThreadPoolExecutor(8) as ex:
        for k, feats in zip(todo, ex.map(lambda k: geocode(f'{k[0]}, {k[1]}, NY'), todo)):
            cache[f'{k[0]}|{k[1]}'] = feats
    json.dump(cache, open(CACHE, 'w'))
    def pick(a0, b):
        want = street_key(a0, house=True)
        for a in variants(a0):
            num = re.match(r'^([\d-]+)', a)
            for f in cache.get(f'{a}|{b}') or []:
                p = f['properties']
                if p.get('borough') != b and p.get('addendum', {}).get('pad', {}).get('bbl', ' ')[0] != BORO_CODE[b]: continue
                if num and p.get('housenumber') and p['housenumber'].replace(' ', '').replace('-', '') != num.group(1).replace('-', ''): continue
                got = street_key(p.get('street', ''))
                if a != a0 and a0 in MANUAL and a == MANUAL[a0]: want_here = street_key(a, house=True)
                else: want_here = want
                if not want_here or not got or want_here[0] != got[0]: continue
                return f['geometry']['coordinates'][1], f['geometry']['coordinates'][0], p.get('label', ''), ('exact' if a not in MANUAL.values() else 'placed by hand: ' + a), p.get('confidence')
        # no exact house number in the city's address file: take the nearest number on the same street, same borough
        n0 = re.match(r'^(\d+)(?:-(\d+))?', a0)
        best = None
        for a in variants(a0):
            for f in cache.get(f'{a}|{b}') or []:
                p = f['properties']; hn = re.match(r'^(\d+)(?:-(\d+))?$', (p.get('housenumber') or '').replace(' ', ''))
                if p.get('borough') != b or not hn or not n0 or street_key(p.get('street', '')) != want: continue
                if bool(hn.group(2)) != bool(n0.group(2)) or (hn.group(2) and hn.group(1) != n0.group(1)): continue
                gap = abs(int(hn.group(2) or hn.group(1)) - int(n0.group(2) or n0.group(1)))
                if gap <= 40 and (best is None or gap < best[0]): best = (gap, f)
        if best:
            f = best[1]; return f['geometry']['coordinates'][1], f['geometry']['coordinates'][0], f['properties'].get('label', ''), f'nearest number ({best[0]} off)', None
        return None
    geo = {k: pick(*k) for k in keys}
    d['lat'] = [geo[(a, b)][0] if geo[(a, b)] else np.nan for a, b in zip(d.address, d.boro)]
    d['lon'] = [geo[(a, b)][1] if geo[(a, b)] else np.nan for a, b in zip(d.address, d.boro)]
    d['geocode_label'] = [geo[(a, b)][2] if geo[(a, b)] else '' for a, b in zip(d.address, d.boro)]
    d['geocode_match'] = [geo[(a, b)][3] if geo[(a, b)] else '' for a, b in zip(d.address, d.boro)]
    # distance from each Election Day site to the ED it serves
    eds = gpd.read_file(f'{ROOT}/data/eds_attr.geojson').to_crs(2263).set_index('id')
    ok = d.lat.notna()
    pts = gpd.GeoSeries(gpd.points_from_xy(d.lon[ok], d.lat[ok]), index=d.index[ok], crs=4326).to_crs(2263)
    dist = pd.Series(np.nan, index=d.index)
    for i, p in pts.items():
        e = d.at[i, 'elect_dist']
        if e in eds.index: dist[i] = eds.geometry[e].distance(p) * 0.3048
    d['meters_from_ed'] = dist.round(0)
    d.to_csv(f'{OUT}/poll_sites_by_ed.csv', index=False)
    # site payload: one row per distinct site, each ED points at its Election Day and early voting site
    d['key'] = d.site + '|' + d.address + '|' + d.boro
    keys2 = sorted(set(d.key)); kix = {k: i for i, k in enumerate(keys2)}
    first = d.drop_duplicates('key').set_index('key')
    sites = [[nice(first.at[k, 'site']), nice(first.at[k, 'address']), first.at[k, 'boro'],
              round(float(first.at[k, 'lat']), 6), round(float(first.at[k, 'lon']), 6), 0 if first.at[k, 'geocode_match'] == 'exact' else 1] for k in keys2]
    on_map = set(eds.index.astype(int))
    by_ed = {}
    for r in d.itertuples():
        by_ed.setdefault(str(int(r.elect_dist)), [None, None])[0 if r.kind == 'eday' else 1] = kix[r.key]
    new = d[(d.kind == 'eday') & ~d.elect_dist.isin(on_map)].groupby('ad').elect_dist.apply(lambda s: sorted(int(x) for x in s)).to_dict()
    json.dump({'election': '2026-11-03', 'label': 'General Election, Tuesday November 3, 2026', 'eday_hours': '6 AM to 9 PM',
               'early': ['2026-10-24', '2026-11-01'], 'source': 'NYC Board of Elections poll site lists (Nov 2026 general, Election Day r1 and Early Voting)',
               'lookup': 'https://findmypollsite.vote.nyc/', 'sites': sites, 'ed': {k: v for k, v in by_ed.items() if int(k) in on_map},
               'new_eds_by_ad': {str(k): v for k, v in new.items()}}, open(f'{SITE}/data/polls.json', 'w'), separators=(',', ':'), ensure_ascii=False)
    print('sites', len(sites), 'EDs on map with a site', sum(1 for k in by_ed if int(k) in on_map), 'of', len(on_map), 'new EDs not on map', sum(len(v) for v in new.values()), 'in', len(new), 'ADs')
    fails = sorted({k for k, v in geo.items() if not v})
    print('addresses', len(keys), 'geocoded', len(keys) - len(fails), 'failed', len(fails))
    for f in fails[:40]: print('  FAIL', f)
    for k, v in geo.items():
        if v and v[3] != 'exact': print('  APPROX', k, v[2], v[3])
    e = d[d.kind == 'eday']
    print('Election Day: median distance to ED (m)', e.meters_from_ed.median(), '95th', e.meters_from_ed.quantile(.95), 'over 2 km', (e.meters_from_ed > 2000).sum())
    print(e[e.meters_from_ed > 2000][['elect_dist', 'site', 'address', 'boro', 'geocode_label', 'meters_from_ed']].to_string())

if __name__ == '__main__':
    main()
