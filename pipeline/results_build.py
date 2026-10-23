"""Election results by ED for four elections, on the ED lines in force at each election.

Inputs:  raw/results/<election folder>/*EDLevel.csv  (NYC BOE, certified ED-level results)
         raw/ed_vintages/nyed_<v>/nyed_<v>/nyed.shp (NYC DCP ED releases)
Outputs: site/data/results/<election>.json   one file per election, loaded on demand by the site
         site/data/results/<election>.topo.json  ED lines for elections held on older lines
         data/results/results_by_ed.csv, results_by_<level>.csv  long tables for downloads
"""
import os, re, csv, glob, json, subprocess
import numpy as np, pandas as pd, geopandas as gpd

ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = os.environ.get('SITE_DIR', f'{ROOT}/site')
OUT = f'{ROOT}/data/results'; os.makedirs(OUT, exist_ok=True); os.makedirs(f'{SITE}/data/results', exist_ok=True)

ELECTIONS = [
    # id, folder, label, date, ED release in force (latest DCP release published before election day)
    ('2024-general', '20241105General Election', '2024 General Election', '2024-11-05', '24c'),
    ('2025-primary', '20250624Primary Election', '2025 Primary Election', '2025-06-24', '25b'),
    ('2025-general', '20251104General Election', '2025 General Election', '2025-11-04', '25c'),
    ('2026-primary', '20260623Primary Election', '2026 Primary Election', '2026-06-23', '26b'),
]
CURRENT_VINTAGE = '26b'              # the Feb 2026 enrollment and the site's ED map use these lines
COUNTERS = ['Public Counter', 'Manually Counted Emergency', 'Absentee / Military', 'Affidavit', 'Federal']
SKIP_OFFICES = re.compile(r'County Committee|Delegate to', re.I)
num = lambda s: int(str(s).replace(',', '') or 0)
ORD = lambda n: f'{n}{"th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")}'
BORO_KEY = {'1': 'Manhattan', '2': 'Bronx', '3': 'Brooklyn', '4': 'Queens', '5': 'Staten Island'}
COUNTY_BORO = {'New York': 'Manhattan', 'Bronx': 'Bronx', 'Kings': 'Brooklyn', 'Queens': 'Queens', 'Richmond': 'Staten Island'}

def scope_of(office, key, counties):
    o = office.lower()
    if 'city council' in o: return 'cc', int(key), f'City Council District {int(key)}'
    if 'assembly' in o and 'member' in o: return 'ad', int(key), f'Assembly District {int(key)}'
    if o.startswith('state senator'): return 'sd', int(key), f'State Senate District {int(key)}'
    if 'congress' in o: return 'cd', int(key), f'Congressional District {int(key)}'
    if o in ('borough president', 'district attorney', 'surrogate') or 'civil court - county' in o:
        b = COUNTY_BORO.get(sorted(counties)[0]) if len(counties) == 1 else None
        return 'boro', b, b or ''
    if 'district leader' in o: return 'party', key, f'Assembly District {key[:-1].lstrip("0")} Part {key[-1]}' if key[-1:].isalpha() else f'Assembly District {key}'
    if 'state committee' in o: return 'party', key, f'Assembly District {int(key)}'
    if 'civil court - district' in o: return 'judicial', key, f'Civil Court District {key}'
    if 'supreme court' in o: return 'judicial', key, f'{ORD(int(key))} Judicial District'
    return 'city', None, 'Citywide'

def parse(folder):
    rows = []
    for f in sorted(glob.glob(f'{ROOT}/raw/results/{folder}/*EDLevel.csv')):
        for r in csv.reader(open(f, newline='', encoding='utf-8-sig', errors='replace')):
            v = r[11:]
            rows.append((int(v[0]) * 1000 + int(v[1]), v[2], v[3], v[5], v[6], v[7], int(v[8]), v[9], num(v[10])))
    df = pd.DataFrame(rows, columns=['ed', 'county', 'status', 'party', 'office', 'key', 'vote_for', 'unit', 'tally'])
    # the citywide file and the county files repeat the same rows; keep one copy and make sure copies agree
    k = ['ed', 'party', 'office', 'key', 'unit']
    dup = df[df.duplicated(k, keep=False)]
    assert (dup.groupby(k).tally.nunique() == 1).all(), f'{folder}: duplicate rows disagree'
    return df.drop_duplicates(k)

def vintage_members(v):
    """ED -> council, assembly, senate, congress, borough for one ED release, by area overlay."""
    eds = gpd.read_file(f'{ROOT}/raw/ed_vintages/nyed_{v}/nyed_{v}/nyed.shp').to_crs(2263)
    eds['ed'] = eds.ElectDist.astype(int); eds['geometry'] = eds.geometry.make_valid(); eds['a'] = eds.area
    out = eds[['ed']].set_index('ed')
    worst = {}
    for k, f, col in [('cc', 'NYC_City_Council_Districts', 'CounDist'), ('ad', 'NYC_State_Assembly_Districts', 'AssemDist'),
                      ('sd', 'NYC_State_Senate_Districts', 'StSenDist'), ('cd', 'NYC_Congressional_Districts', 'CongDist'),
                      ('boro', 'NYC_Borough_Boundary_full', 'BoroName')]:
        d = gpd.read_file(f'{ROOT}/raw/{f}.geojson').to_crs(2263)[[col, 'geometry']]; d['geometry'] = d.geometry.make_valid()
        ov = gpd.overlay(eds[['ed', 'a', 'geometry']], d, how='intersection', keep_geom_type=True)
        ov['share'] = ov.area / ov.a
        top = ov.sort_values('share', ascending=False).drop_duplicates('ed').set_index('ed')
        out[k] = top[col]; worst[k] = top.share
    return out, worst, eds

def main():
    enroll = json.load(open(f'{SITE}/data/enroll.json'))['ed']
    summary = []
    long_rows = []
    for eid, folder, label, date, vint in ELECTIONS:
        df = parse(folder)
        df = df[~df.office.str.contains(SKIP_OFFICES)]
        # combined EDs: their votes are reported under a host ED
        comb = df[df.status.str.startswith('COMBINED')][['ed', 'status']].drop_duplicates()
        host = {}
        for e, s in comb.itertuples(index=False):
            m = re.match(r'COMBINED INTO (\d+)/(\d+)', s); host[int(e)] = int(m.group(2)) * 1000 + int(m.group(1))
        assert df[df.ed.isin(host)].tally.sum() == 0, 'combined EDs should report zero'
        mem, worst, eds = vintage_members(vint)
        known = set(mem.index)
        voted = set(df[df.tally > 0].ed)
        assert voted <= known, f'{eid}: EDs with votes missing from release {vint}: {sorted(voted - known)[:10]}'
        contests = []
        for (party, office, key), g in df.groupby(['party', 'office', 'key'], sort=False):
            counties = set(g.county)
            stype, sid, sname = scope_of(office, key, counties)
            vote_for = int(g.vote_for.iloc[0])
            choices = [u for u in g.unit.unique() if u not in COUNTERS]
            # candidates: same person across party lines adds up; keep the lines too
            def person(u): return re.sub(r'\s*\((?!Write-In)[^)]*\)\s*$', '', u).strip()
            cands = {}
            for u in choices:
                if u == 'Scattered': continue
                cands.setdefault(person(u), []).append(u)
            order = sorted(cands, key=lambda c: -g[g.unit.isin(cands[c])].tally.sum())
            lines = [l for c in order for l in cands[c]] + (['Scattered'] if 'Scattered' in choices else [])
            piv = g.pivot_table(index='ed', columns='unit', values='tally', aggfunc='sum').fillna(0).astype(int)
            piv = piv[piv.index.map(lambda e: e not in host)]                  # host EDs carry the votes
            piv['__ballots'] = sum(piv[c] for c in COUNTERS if c in piv.columns)
            rows = {str(e): [int(r['__ballots'])] + [int(r.get(l, 0)) for l in lines] for e, r in piv.iterrows()}
            totals = {l: int(piv[l].sum()) for l in lines}
            title = office if stype in ('city',) else f'{office}, {sname}' if sname else office
            if party: title = f'{party} Primary: {title}'
            cid = re.sub(r'[^a-z0-9]+', '-', f'{party} {office} {key}'.lower()).strip('-')
            contests.append({'id': cid, 'title': title, 'office': office, 'party': party, 'scope': [stype, sid], 'scope_name': sname,
                             'vote_for': vote_for, 'candidates': [{'name': c, 'lines': cands[c], 'votes': sum(totals[l] for l in cands[c])} for c in order],
                             'lines': lines, 'ballots': int(piv['__ballots'].sum()), 'rows': rows})
            for e, r in piv.iterrows():
                for l in lines: long_rows.append((eid, cid, title, int(e), l, person(l) if l != 'Scattered' else 'Write-ins', int(r[l])))
                long_rows.append((eid, cid, title, int(e), '__ballots', 'Ballots cast', int(r['__ballots'])))
        rcv_file = f'{SITE}/data/results/{eid}-rcv.json'
        if os.path.exists(rcv_file):          # ranked-choice contests come from the cast vote records (rcv_build.py)
            for con in json.load(open(rcv_file)).values():
                contests.append(con)
                for e, r in con['rows'].items():
                    for l, v in zip(con['lines'], r[1:]): long_rows.append((eid, con['id'], con['title'], int(e), l, l if l != 'Scattered' else 'Write-ins', int(v)))
                    long_rows.append((eid, con['id'], con['title'], int(e), '__ballots', 'Ballots cast', int(r[0])))
                for e, r in con.get('rcv', {}).get('rows', {}).items():
                    for n, v in zip(con['rcv']['finalists'], r[2:]): long_rows.append((eid, con['id'] + '-final-round', con['title'] + ' (final ranked-choice round)', int(e), n, n, int(v)))
                    long_rows.append((eid, con['id'] + '-final-round', con['title'] + ' (final ranked-choice round)', int(e), '__inactive', 'Inactive ballots', int(r[1])))
        # members of every ED in this release that carries votes (host or member), so districts can be summed
        used = set(int(e) for c in contests for e in c['rows']) | set(host) | set(host.values()) | set(int(e) for c in contests for e in c.get('rcv', {}).get('rows', {}))
        memb = {str(e): [None if pd.isna(mem.at[e, k]) else (int(mem.at[e, k]) if k != 'boro' else mem.at[e, k]) for k in ['cc', 'ad', 'sd', 'cd', 'boro']] for e in sorted(used) if e in known}
        split = {k: int((worst[k].reindex(list(used)).dropna() < 0.95).sum()) for k in worst}
        payload = {'id': eid, 'label': label, 'date': date, 'vintage': vint, 'same_lines_as_map': vint == CURRENT_VINTAGE,
                   'combined': {str(k): v for k, v in host.items()}, 'eds': memb, 'contests': contests}
        json.dump(payload, open(f'{SITE}/data/results/{eid}.json', 'w'), separators=(',', ':'))
        if vint != CURRENT_VINTAGE:
            src = f'{OUT}/eds_{vint}.geojson'
            eds[['ed', 'geometry']].rename(columns={'ed': 'id'}).to_crs(4326).to_file(src, driver='GeoJSON')
            subprocess.run(f'npx mapshaper -i {src} name=ed -clean -simplify 40% keep-shapes -o {SITE}/data/results/{eid}.topo.json format=topojson quantization=1e6',
                           shell=True, check=True, capture_output=True, cwd=ROOT)
        summary.append((eid, vint, len(contests), len(host), split))
        print(eid, vint, 'contests', len(contests), 'combined EDs', len(host), 'EDs not 95% inside one district', split)
    L = pd.DataFrame(long_rows, columns=['election', 'contest_id', 'contest', 'elect_dist', 'ballot_line', 'candidate', 'votes'])
    L.to_csv(f'{OUT}/results_by_ed.csv', index=False)
    # small index so the site can search every race and candidate without loading each election
    index = []
    for e, f, l, d, v in ELECTIONS:
        for c in json.load(open(f'{SITE}/data/results/{e}.json'))['contests']:
            index.append([e, c['id'], c['title'], [x['name'] for x in c['candidates']][:12], c['ballots']])
    json.dump({'elections': [{'id': e, 'label': l, 'date': d, 'vintage': v, 'same_lines_as_map': v == CURRENT_VINTAGE} for e, f, l, d, v in ELECTIONS],
               'contests': index}, open(f'{SITE}/data/results/elections.json', 'w'), separators=(',', ':'), ensure_ascii=False)
    print('rows', len(L))

if __name__ == '__main__':
    main()
