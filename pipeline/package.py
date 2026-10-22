"""Rebuild the downloadable database and CSV bundle from scratch.
Run after build_db.py (voter tables) and census_build.py (census tables)."""
import os, json, sqlite3, shutil, zipfile, subprocess
import pandas as pd

ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); OUT = f'{ROOT}/out'; D = f'{ROOT}/data/census'
subprocess.run(['python3', '-I', f'{ROOT}/pipeline/build_db.py', os.environ.get('ENROLLMENT_DIR', f'{ROOT}/raw/enrollment')], check=True, cwd=ROOT, capture_output=True)
db = f'{OUT}/nyc_voter_enrollment_feb2026.sqlite'
con = sqlite3.connect(db)

reach = json.load(open(f'{ROOT}/data/district_reach.json'))
nyc_share = pd.DataFrame([dict(district_type={'sd': 'State Senate', 'cd': 'Congress'}[k], district=int(d), district_population_2020=v['pop2020'],
                               nyc_population_2020=v['nyc_pop2020'], nyc_share_pct=v['nyc_share'], counties_outside_nyc=v['outside']) for k in reach for d, v in reach[k].items()])
nyc_share.to_sql('district_nyc_share', con, index=False); nyc_share.to_csv(f'{OUT}/district_nyc_share.csv', index=False)

names = {'tract': 'census_by_tract', 'ed': 'census_by_election_district', 'cc': 'census_by_council', 'ad': 'census_by_assembly',
         'sd': 'census_by_senate', 'cd': 'census_by_congressional', 'boro': 'census_by_borough'}
for k, n in names.items():
    df = pd.read_csv(f'{D}/census_{k}.csv', dtype={'tract_geoid': str})
    df.to_sql(n, con, index=False); df.to_csv(f'{OUT}/{n}.csv', index=False)
for src, n in [('tract_counts', 'census_tract_counts'), ('tract_counts_moe', 'census_tract_counts_moe'), ('xw_tract_ed', 'xw_tract_election_district')]:
    df = pd.read_csv(f'{D}/{src}.csv', dtype={'tract_geoid': str, 'tract': str}); df.to_sql(n, con, index=False); df.to_csv(f'{OUT}/{n}.csv', index=False)
spec = json.load(open(f'{D}/indicators.json'))
dic = pd.DataFrame([{'column': i['col'], 'label': i['label'], 'topic': i['cat'], 'numerator_field': i.get('num', ''), 'denominator_field': i.get('den', ''),
                     'kind': i.get('type', 'percent'), 'universe': i.get('unit', 'of residents' if i.get('den') else ''), 'notes': i.get('desc', '')} for i in spec['indicators']])
dic.to_sql('census_indicator_dictionary', con, index=False); dic.to_csv(f'{OUT}/census_indicator_dictionary.csv', index=False)
con.executemany('INSERT INTO metadata VALUES (?,?)', [
    ('district_nyc_share', 'Share of each Senate and Congressional district 2020 Census population living in NYC (2020 blocks in TIGER 2024 lines). Only SD 34, SD 36, CD 3 and CD 16 extend outside the city.'),
    ('census_source', 'American Community Survey 2020-2024 5-year estimates, detailed tables, Census tracts (2020 tract lines). US Census Bureau table-based summary file.'),
    ('census_method', 'Each reporting unit is a set of tract shares from 2020 Census blocks (population for person counts, housing units for household counts). Estimates add tract counts times shares. Margins of error (90%) add tract MOEs times shares as a root-sum-of-squares; percentage MOEs use the Census ratio formula. Medians above the tract level are interpolated from income brackets and carry no MOE.'),
    ('census_reliability', 'high: coefficient of variation under 15%; medium: 15-30%; low: over 30%. A unit with more than half its residents from split tracts is at most medium. A registration rate above 130 per 100 eligible is low.'),
    ('census_caveats', 'MOEs cover survey sampling, not the error from splitting tracts. 21 small EDs contain no 2020 block centers and receive no census residents; neighbors carry them.')])
con.commit(); con.execute('VACUUM'); con.close()

readme = open(f'{ROOT}/pipeline/README_data.txt').read()
open(f'{OUT}/README.txt', 'w').write(readme)
z = f'{OUT}/nyc_city_open_data_feb2026.zip'
if os.path.exists(z): os.remove(z)
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for f in sorted(os.listdir(OUT)):
        if f.endswith('.csv') or f in ('README.txt', 'audit_report.md'): zf.write(f'{OUT}/{f}', f)
os.makedirs(f'{ROOT}/site/downloads', exist_ok=True)
shutil.copy(db, f'{ROOT}/site/downloads/'); shutil.copy(z, f'{ROOT}/site/downloads/')
print('database', os.path.getsize(db), 'zip', os.path.getsize(z))
