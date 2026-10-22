"""Map files for the site: ED attributes, simplified boundaries, label points, enrollment JSON,
neighborhood names, and how much of each Senate/Congress district lies in NYC.
Run from the repo root after crosswalk.py and build_db.py. Needs `npx mapshaper` (npm i mapshaper)."""
import os, json, subprocess, urllib.request
import numpy as np, pandas as pd, geopandas as gpd, pyogrio
from shapely.ops import polylabel

ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(ROOT)
os.makedirs('site/data', exist_ok=True); os.makedirs('data/census', exist_ok=True)

# 1. ED polygons with their districts and borough (zero-voter EDs take the borough of the nearest ED in the same Assembly district)
ed = gpd.read_file('raw/ED_user.geojson').to_crs(2263)
xw = pd.read_csv('data/ed_crosswalk_raw.csv')
e = pd.read_csv('out/election_districts_enrollment.csv')[['elect_dist', 'borough']]
ed = ed.merge(xw[['ElectDist', 'cc', 'ad', 'sd', 'cd']], on='ElectDist').merge(e, left_on='ElectDist', right_on='elect_dist', how='left')
known = ed[ed.borough.notna()]; fill = {}
for _, r in ed[ed.borough.isna()].iterrows():
    k = known[known.ad == r.ad]; fill[r.ElectDist] = k.loc[k.distance(r.geometry).idxmin(), 'borough']
ed['borough'] = ed.borough.fillna(ed.ElectDist.map(fill))
ed.rename(columns={'ElectDist': 'id', 'borough': 'boro'})[['id', 'cc', 'ad', 'sd', 'cd', 'boro', 'geometry']].to_crs(4326).to_file('data/eds_attr.geojson', driver='GeoJSON')

# 2. simplified topology: EDs plus districts dissolved from them, so every line agrees
subprocess.run('npx mapshaper -i data/eds_attr.geojson name=ed -clean -simplify 40% keep-shapes '
               '-dissolve cc + name=cc -target ed -dissolve ad + name=ad -target ed -dissolve sd + name=sd '
               '-target ed -dissolve cd + name=cd -target ed -dissolve boro + name=boro '
               "-target '*' -o site/data/nyc.topo.json format=topojson quantization=1e6 target='*'", shell=True, check=True)
subprocess.run('npx mapshaper -i raw/tracts2020.geojson -filter-fields GEOID -clean -simplify 30% keep-shapes '
               '-o site/data/tracts.topo.json format=topojson quantization=1e5', shell=True, check=True)

# 3. label points (pole of inaccessibility of the largest part)
def lp(geom):
    if geom.geom_type == 'MultiPolygon': geom = max(geom.geoms, key=lambda p: p.area)
    try: return polylabel(geom, tolerance=20)
    except Exception: return geom.representative_point()
g = gpd.read_file('data/eds_attr.geojson').to_crs(2263)
labels = {}
for lvl in ['cc', 'ad', 'sd', 'cd', 'boro']:
    d = g.dissolve(by=lvl).reset_index()
    pts = gpd.GeoSeries([lp(x) for x in d.geometry], crs=2263).to_crs(4326)
    labels[lvl] = {str(k if lvl == 'boro' else int(k)): [round(p.y, 5), round(p.x, 5)] for k, p in zip(d[lvl], pts)}
pts = gpd.GeoSeries([lp(x) for x in g.geometry], crs=2263).to_crs(4326)
labels['ed'] = {str(int(k)): [round(p.y, 5), round(p.x, 5)] for k, p in zip(g.id, pts)}
json.dump(labels, open('site/data/labels.json', 'w'), separators=(',', ':'))
t = gpd.read_file('raw/tracts2020.geojson').to_crs(2263)
pts = gpd.GeoSeries([lp(x) for x in t.geometry], crs=2263).to_crs(4326)
json.dump({k: [round(p.y, 5), round(p.x, 5)] for k, p in zip(t.GEOID, pts)}, open('site/data/tract_labels.json', 'w'), separators=(',', ':'))

# 4. enrollment for the browser: 21 numbers per ED (total, active, inactive x dem rep con wor oth blank total)
e = pd.read_csv('out/election_districts_enrollment.csv')
P = ['dem', 'rep', 'con', 'wor', 'oth', 'blank', 'total']
cols = [f'{p}_{s}' for s in ['total', 'active', 'inactive'] for p in P]
json.dump({'asof': '2026-02-20', 'parties': P, 'statuses': ['total', 'active', 'inactive'],
           'ed': {str(r.elect_dist): [int(r[c]) for c in cols] for _, r in e.iterrows()}}, open('site/data/enroll.json', 'w'), separators=(',', ':'))
json.dump(json.load(open('site/data/enroll.json')), open('data/enroll.json', 'w'), separators=(',', ':'))

# 5. neighborhood names (fallback labels when map tiles are blocked)
d = json.load(urllib.request.urlopen('https://services5.arcgis.com/GfwWNkhOj9bNBqoJ/ArcGIS/rest/services/Neighborhood_Names/FeatureServer/0/query?where=1%3D1&outFields=Name&outSR=4326&f=geojson&resultRecordCount=2000'))
json.dump([[f['properties']['Name'], round(f['geometry']['coordinates'][1], 5), round(f['geometry']['coordinates'][0], 5)] for f in d['features']],
          open('site/data/hoods.json', 'w'), separators=(',', ':'))

# 6. share of each Senate / Congress district's 2020 residents living in NYC
b = pyogrio.read_dataframe('zip://raw/census/tl_2020_36_tabblock20.zip', read_geometry=False, columns=['COUNTYFP20', 'POP20', 'INTPTLAT20', 'INTPTLON20'])
b = b[b.POP20 > 0]
pts = gpd.GeoDataFrame(b, geometry=gpd.points_from_xy(b.INTPTLON20.astype(float), b.INTPTLAT20.astype(float)), crs=4269)
pts['nyc'] = pts.COUNTYFP20.isin({'005', '047', '061', '081', '085'})
CN = {'059': 'Nassau', '119': 'Westchester', '103': 'Suffolk', '087': 'Rockland'}
out = {}
for key, f, col in [('sd', 'raw/census/tl_2024_36_sldu.zip', 'SLDUST'), ('cd', 'raw/census/tl_2024_36_cd119.zip', 'CD119FP')]:
    d = gpd.read_file('zip://' + f).to_crs(4269)[[col, 'geometry']]
    j = gpd.sjoin(pts, d, predicate='within'); j['dist'] = j[col].astype(int)
    tt = pd.DataFrame({'pop': j.groupby('dist').POP20.sum(), 'nyc_pop': j[j.nyc].groupby('dist').POP20.sum()}).fillna(0)
    tt = tt[tt.nyc_pop > 0]; tt['nyc_share'] = (tt.nyc_pop / tt['pop'] * 100).round(1)
    outside = j[~j.nyc & j.dist.isin(tt.index)].groupby(['dist', 'COUNTYFP20']).POP20.sum()
    out[key] = {int(i): {'pop2020': int(r['pop']), 'nyc_pop2020': int(r.nyc_pop), 'nyc_share': float(r.nyc_share),
                         'outside': ', '.join(CN.get(c, c) for c, v in outside.get(i, pd.Series(dtype=int)).sort_values(ascending=False).items() if v > 0) if i in outside.index.get_level_values(0) else ''}
                for i, r in tt.iterrows()}
json.dump(out, open('data/district_reach.json', 'w'), indent=1)
json.dump(out, open('site/data/reach.json', 'w'), separators=(',', ':'))
print('map files written')
