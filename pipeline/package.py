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
# ---- v4 datasets: results, poll sites, representatives, eligible voters, homes, conditions, funding, donations
SITE = os.environ.get('SITE_DIR', f'{ROOT}/site') + '/data'
def put(df, name, meta=None):
    df.to_sql(name, con, index=False, if_exists='replace'); df.to_csv(f'{OUT}/{name}.csv', index=False)
    if meta: con.execute('INSERT INTO metadata VALUES (?,?)', (name, meta))
LV = {'cc': 'council', 'ad': 'assembly', 'sd': 'senate', 'cd': 'congressional', 'boro': 'borough', 'ed': 'election_district', 'tract': 'tract'}
contests, votes, rcv = [], [], []
for e in json.load(open(f'{SITE}/results/elections.json'))['elections']:
    E = json.load(open(f'{SITE}/results/{e["id"]}.json'))
    for c in E['contests']:
        contests.append(dict(election=E['id'], election_date=E['date'], ed_lines=E['vintage'], contest_id=c['id'], contest=c['title'], office=c['office'], party=c['party'],
                             district_type=c['scope'][0], district=c['scope'][1], vote_for=c['vote_for'], ballots=c['ballots'],
                             ranked_choice_finalists=' | '.join(c['rcv']['finalists']) if c.get('rcv') else ''))
        cand = {l: cd['name'] for cd in c['candidates'] for l in cd['lines']}
        for ed, r in c['rows'].items():
            votes.append((E['id'], c['id'], int(ed), '__ballots__', '', r[0]))
            for l, v in zip(c['lines'], r[1:]):
                if v: votes.append((E['id'], c['id'], int(ed), l, cand.get(l, l), v))
        if c.get('rcv'):
            f1, f2 = c['rcv']['finalists']
            for ed, r in c['rcv']['rows'].items(): rcv.append((E['id'], c['id'], int(ed), r[0], r[1], f1, r[2], f2, r[3]))
    for m, h in E['combined'].items(): votes.append((E['id'], '__combined__', int(m), f'reported with ED {h}', '', 0))
V = pd.DataFrame(votes, columns=['election', 'contest_id', 'elect_dist', 'ballot_line', 'candidate', 'votes'])
comb = V[V.contest_id == '__combined__'][['election', 'elect_dist', 'ballot_line']].rename(columns={'ballot_line': 'note'})
V = V[V.contest_id != '__combined__']
put(pd.DataFrame(contests), 'results_contests', 'One row per contest: office, party (primaries), district, ballots, and the ED line release its ED numbers refer to (ed_lines).')
for eid, g in V.groupby('election'):      # readable CSVs, one per election
    g.reset_index(drop=True).to_csv(f'{OUT}/results_{eid.replace("-", "_")}_by_ed.csv', index=False)
# in the database the long table is stored compactly (a line table plus integer votes) behind a view with the same columns
lines = V[['election', 'contest_id', 'ballot_line', 'candidate']].drop_duplicates().reset_index(drop=True); lines['line_id'] = lines.index + 1
Vi = V.merge(lines, on=['election', 'contest_id', 'ballot_line', 'candidate'])[['line_id', 'elect_dist', 'votes']]
lines.to_sql('results_lines', con, index=False, if_exists='replace'); Vi.to_sql('results_votes', con, index=False, if_exists='replace')
# no indexes, to keep the download small; CREATE INDEX on results_votes(line_id) speeds up big queries
con.execute('CREATE VIEW results_by_ed AS SELECT l.election, l.contest_id, v.elect_dist, l.ballot_line, l.candidate, v.votes FROM results_votes v JOIN results_lines l USING (line_id)')
con.execute('INSERT INTO metadata VALUES (?,?)', ('results_by_ed', 'View: certified results by ED for all four elections. ballot_line "__ballots__" is ballots cast in the ED for that contest; other rows are votes on each ballot line (zero-vote rows left out). ED numbers follow results_contests.ed_lines.'))
put(comb, 'results_combined_eds', 'EDs the Board of Elections reported together with a neighboring ED; their votes are in the host ED rows.')
put(pd.DataFrame(rcv, columns=['election', 'contest_id', 'elect_dist', 'ballots', 'exhausted', 'finalist_1', 'finalist_1_votes', 'finalist_2', 'finalist_2_votes']),
    'results_rcv_final_round_by_ed', 'June 2025 primary ranked-choice contests: each ballot counted where it was cast, in the final round (from the BOE cast vote records; totals equal the certified final round).')
po = pd.read_csv(f'{ROOT}/data/polls/poll_sites_by_ed.csv'); put(po, 'poll_sites_by_ed', 'November 3, 2026 general election: Election Day and early voting sites for every ED (BOE lists), geocoded with NYC GeoSearch.')
put(pd.read_csv(f'{ROOT}/data/reps/representatives.csv'), 'representatives', 'Officeholders as of the date in reps.json, from council.nyc.gov, nyassembly.gov, nysenate.gov and clerk.house.gov, checked against certified winners.')
for k in ['cc', 'ad', 'sd', 'cd', 'boro', 'ed', 'tract']:
    for src, name in [(f'{ROOT}/data/cvap/cvap_{k}.csv', f'eligible_voters_by_{LV[k]}'), (f'{ROOT}/data/doors/doors_{k}.csv', f'homes_by_{LV[k]}'), (f'{ROOT}/data/conditions/conditions_{k}.csv', f'conditions_by_{LV[k]}')]:
        if os.path.exists(src): put(pd.read_csv(src, dtype={'tract_geoid': str, 'tract': str}), name)
put(pd.read_csv(f'{ROOT}/data/conditions/coverage.csv'), 'conditions_sources', 'Window, record count and placement rates for each neighborhood conditions source.')
put(pd.read_csv(f'{ROOT}/data/funding/funding_fy2027_by_district.csv'), 'council_funding_fy2027_by_district')
put(pd.read_csv(f'{ROOT}/data/funding/funding_fy2027_designations.csv'), 'council_funding_fy2027_designations', 'Every FY2027 Council discretionary designation, from the Council funding disclosure workbook.')
put(pd.read_csv(f'{ROOT}/data/donations/donations_by_zip.csv', dtype=str), 'donations_by_zip', 'Political contributions by donor ZIP area (MODZCTA): 2025 city races (CFB) and 2025-2026 federal (FEC, itemized gifts).')
con.commit(); con.execute('VACUUM'); con.close()

readme = open(f'{ROOT}/pipeline/README_data.txt').read()
open(f'{OUT}/README.txt', 'w').write(readme)
z = f'{OUT}/nyc_city_open_data_feb2026.zip'
if os.path.exists(z): os.remove(z)
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for f in sorted(os.listdir(OUT)):
        if f.endswith('.csv') or f in ('README.txt', 'audit_report.md', 'report_v4.md'): zf.write(f'{OUT}/{f}', f)
print('database', os.path.getsize(db), 'zip', os.path.getsize(z))
# published names
shutil.copy(db, f'{OUT}/open_nyc_data.sqlite'); shutil.copy(z, f'{OUT}/open_nyc_data_csv.zip')
