"""Reference files for conditions_build.py. Rebuild only when the election district lines or PLUTO change.

  ref/eds.geojson.gz   the map's election districts with their Council, Assembly, Senate, Congress and borough
  ref/lot_ed.csv.gz    every PLUTO tax lot (BBL) and the election district holding its PLUTO point;
                       a point outside every district (piers, marsh edges) takes the nearest one within 2,000 feet
Inputs: data/eds_attr.geojson (from crosswalk.py), raw/pluto/pluto_26v2.csv
"""
import os, gzip, json
import pandas as pd, geopandas as gpd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(HERE))
REF = os.environ.get('REF_DIR', f'{HERE}/ref')

def main():
    os.makedirs(REF, exist_ok=True)
    eds = gpd.read_file(f'{ROOT}/data/eds_attr.geojson')[['id', 'cc', 'ad', 'sd', 'cd', 'boro', 'geometry']].to_crs(4326)
    with gzip.open(f'{REF}/eds.geojson.gz', 'wt') as f: f.write(eds.to_json(drop_id=True))
    p = pd.read_csv(f'{ROOT}/raw/pluto/pluto_26v2.csv', usecols=['bbl', 'latitude', 'longitude'], low_memory=False).dropna()
    p['bbl'] = p.bbl.astype('int64')
    pts = gpd.GeoDataFrame(p[['bbl']], geometry=gpd.points_from_xy(p.longitude, p.latitude), crs=4326).to_crs(2263)
    e2 = eds[['id', 'geometry']].to_crs(2263)
    j = gpd.sjoin(pts, e2, how='left', predicate='within')
    j = j[~j.index.duplicated()]
    miss = j.id.isna()
    if miss.any():
        nn = gpd.sjoin_nearest(pts[miss], e2, how='left', max_distance=2000)
        nn = nn[~nn.index.duplicated()]
        j.loc[miss, 'id'] = nn.id
    out = j.dropna(subset=['id'])[['bbl', 'id']].rename(columns={'id': 'ed'}).astype('int64').sort_values('bbl')
    out.to_csv(f'{REF}/lot_ed.csv.gz', index=False)
    print(f'{len(eds)} EDs; {len(out):,} of {len(p):,} lots placed ({int(miss.sum()):,} by nearest within 2,000 ft)')

if __name__ == '__main__':
    main()
