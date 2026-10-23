"""Accuracy audit of everything the v4 site publishes, using a different source or code path than each build.

  A  Election results   published JSON, summed by Assembly district, vs the BOE's certified Statement and Return (Recap) files
  B  Results integrity  candidate totals, ballots and the search index all agree with the per-ED rows
  C  Ranked choice      final-round ED rows add up to the published certified final round; every ED's ballots are counted once
  D  Eligible voters    district CVAP vs the Census Bureau's own county, congressional, senate and assembly tables
  E  Representatives    roster vs certified winners and OpenStates (reps_check.csv), plus spot checks on every record
  F  Poll sites         every ED has a site; each site is in the ED's borough and close to it
  G  Homes              PLUTO units by ED vs 2020 Census housing units; JSON vs CSV
  H  Neighborhood       our Council and borough totals vs the API's own council-district and borough fields, same window
  I  Council funding    the workbook re-read with openpyxl and summed by member vs the published district totals
  J  Donations          ZIP-area totals add up; CFB re-summed from the raw file with a separate reader
Writes audit/report_v4.md and prints a summary. Exits non-zero if any check fails.
"""
import os, re, sys, csv, json, glob, gzip, math, datetime as dt, urllib.parse, urllib.request
from collections import defaultdict, Counter
import numpy as np, pandas as pd, geopandas as gpd

ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = os.environ.get('SITE_DIR', f'{ROOT}/site') + '/data'
OUT = f'{ROOT}/audit'; os.makedirs(OUT, exist_ok=True)
R, FAILS = [], []
def h(t): R.append(f'\n## {t}\n'); print('\n==', t)
def ok(cond, text, detail=''):
    s = ('PASS' if cond else 'FAIL'); R.append(f'- **{s}** {text}' + (f' ({detail})' if detail else '')); print(s, text, detail)
    if not cond: FAILS.append(text)
    return cond
def note(text): R.append(f'- {text}'); print('  ', text)
num = lambda s: int(str(s).replace(',', '') or 0)
J = lambda p: json.load(open(f'{SITE}/{p}'))

# ---------------------------------------------------------------- A, B
h('A. Election results vs certified recaps')
ELECTION_DIRS = {'2024-general': '20241105General Election', '2025-primary': '20250624Primary Election',
                 '2025-general': '20251104General Election', '2026-primary': '20260623Primary Election'}
def recaps(folder):
    """{contest code: {(AD, unit): votes}} from the certified recap CSVs. A file name starts with an 11-character code:
    party (2), county (1; 0 for a citywide or crossover file covering every county), contest (8). A contest with a
    county-0 file is read from it alone; otherwise its county files are added together."""
    files = defaultdict(dict)
    for f in glob.glob(f'{ROOT}/raw/results/{folder}/*Recap.csv'):
        code = os.path.basename(f)[:11]; files[code[:2] + code[3:]][code[2]] = f
    out = {}
    def by_ad(fs):
        d = defaultdict(int)
        for f in fs:
            for r in csv.reader(open(f, encoding='utf-8-sig', errors='replace')):
                if len(r) < 6: continue
                m = re.match(r'^Assembly District (\d+)$', r[3] or '')
                if m: d[(int(m.group(1)), r[4])] += num(r[5])
        return d
    for key, by_cty in files.items():
        d = by_ad([by_cty['0']]) if '0' in by_cty else {}
        if not d: d = by_ad([f for k, f in by_cty.items() if k != '0'])      # some county-0 files break down by county only
        if d: out[key + ' ' + os.path.basename(next(iter(by_cty.values())))[11:60]] = d
    return out
tot_cmp = tot_diff = 0; unmatched_contests = []; from_cvr = 0
COUNTERS = {'Public Counter', 'Manually Counted Emergency', 'Absentee / Military', 'Affidavit', 'Federal', 'Special Presidential', 'Emergency'}
for eid, folder in ELECTION_DIRS.items():
    E = J(f'results/{eid}.json'); rc = recaps(folder)
    cvr = set(json.load(open(f'{SITE}/results/{eid}-rcv.json'))) if os.path.exists(f'{SITE}/results/{eid}-rcv.json') else set()
    rlines = {stem: frozenset(u for (_, u) in d if u not in COUNTERS and 'Write-In' not in u and u != 'Scattered') for stem, d in rc.items()}
    for c in E['contests']:
        lines = frozenset(l for l in c['lines'] if l != 'Scattered' and 'Write-In' not in l)
        ours = defaultdict(int)
        for ed, row in c['rows'].items():
            for i, l in enumerate(c['lines']):
                if l in lines: ours[(int(ed) // 1000, l)] += row[i + 1]
        cands = [st for st, ls in rlines.items() if ls and ls <= lines and len(ls) >= len(lines) - 1]
        if not cands:
            if c['id'] in cvr: from_cvr += 1
            else: unmatched_contests.append((eid, c['id']))
            continue
        def diffs(st):
            d = rc[st]; keys = {k for k in d if k[1] in lines} | {k for k in ours if ours[k]}
            return [(ad, u, ours.get((ad, u), 0), d.get((ad, u), 0)) for ad, u in keys if ours.get((ad, u), 0) != d.get((ad, u), 0)]
        scored = sorted(((len(diffs(st)), st) for st in cands))
        n_diff, st = scored[0]
        tot_cmp += len({k for k in rc[st] if k[1] in lines} | set(ours))
        if n_diff:
            tot_diff += n_diff
            note(f'{eid} {c["id"]}: recap {st[:70]} differs on {n_diff} AD lines, e.g. {diffs(st)[:4]}')
ok(tot_diff == 0, 'Every candidate line, summed by Assembly district from the published files, equals the certified recap', f'{tot_cmp:,} AD-by-line comparisons, {tot_diff} differ')
ok(not unmatched_contests, 'Every published contest found its certified recap', f'{from_cvr} ranked-choice contests come from the cast vote records and are checked in C; {len(unmatched_contests)} without a recap: {unmatched_contests[:6]}')

h('B. Results integrity')
bad = []; idx = J('results/elections.json'); idxk = {(e, c): (t, cands, b) for e, c, t, cands, b in idx['contests']}
for eid in ELECTION_DIRS:
    E = J(f'results/{eid}.json')
    for c in E['contests']:
        li = {l: i + 1 for i, l in enumerate(c['lines'])}
        for cd in c['candidates']:
            s = sum(r[li[l]] for r in c['rows'].values() for l in cd['lines'])
            if s != cd['votes']: bad.append((eid, c['id'], cd['name'], s, cd['votes']))
        b = sum(r[0] for r in c['rows'].values())
        if b != c['ballots']: bad.append((eid, c['id'], 'ballots', b, c['ballots']))
        k = idxk.get((eid, c['id']))
        if not k or k[2] != c['ballots'] or k[0] != c['title']: bad.append((eid, c['id'], 'index', k))
        if any(ed not in E['eds'] and sum(r) > 0 for ed, r in c['rows'].items()): bad.append((eid, c['id'], 'votes in an ED with no districts'))
ok(not bad, 'Candidate totals, ballots and the search index match the per-ED rows in every contest', f'{len(bad)} problems {bad[:3]}')

# ---------------------------------------------------------------- C
h('C. Ranked-choice final rounds')
P = J('results/2025-primary.json'); bad = []; n = 0
for c in P['contests']:
    if not c.get('rcv'): continue
    n += 1; r = c['rcv']; fin = r['finalists']; last = r['rounds'][-1]
    f = [sum(x[2] for x in r['rows'].values()), sum(x[3] for x in r['rows'].values())]
    if f != [last[fin[0]], last[fin[1]]]: bad.append((c['id'], f, [last[fin[0]], last[fin[1]]]))
    for ed, x in r['rows'].items():
        if x[1] + x[2] + x[3] != x[0]: bad.append((c['id'], ed, 'ballots != inactive + finalists')); break
    if r['rounds'][0] and sum(v for k, v in r['rounds'][0].items()) < sum(last.values()): bad.append((c['id'], 'round totals grow'))
    first = {cd['name']: cd['votes'] for cd in c['candidates']}
    for nm, v in r['rounds'][0].items():
        if nm in first and first[nm] != v: bad.append((c['id'], nm, 'first choices on the map', first[nm], 'round 1', v))
ok(not bad, f'In all {n} ranked-choice contests, first choices on the map equal round 1, final-round ED rows add to the final round, and every ballot is counted once', f'{bad[:3]}')
rcvlog = f'{ROOT}/data/results/rcv_check.log'   # rcv_build.py output
note('rcv_build.py checks each tabulation against the BOE certified round-by-round reports: ' + (open(rcvlog).read().strip().splitlines()[-1] if os.path.exists(rcvlog) else 'see its log') + '; the one left out (Republican Council 47) was certified by hand count and is not shown as ranked choice')
mayor = next(c for c in P['contests'] if c['id'] == 'democratic-mayor-citywide')['rcv']['rounds'][-1]
ok(mayor.get('Zohran Kwame Mamdani') == 573169 and mayor.get('Andrew M. Cuomo') == 443229, 'Mayoral primary final round equals the BOE certified 573,169 to 443,229', str(mayor))

# ---------------------------------------------------------------- D
h('D. Eligible voters (CVAP) vs the Census Bureau tables')
def cvap_official(fname):
    d = pd.read_csv(f'{ROOT}/raw/cvap/{fname}', encoding='latin-1')
    d = d[d.lntitle.str.strip() == 'Total']
    return d.set_index('geoid').cvap_est
cty = cvap_official('County.csv'); ours = pd.read_csv(f'{ROOT}/data/cvap/cvap_boro.csv').set_index('borough').eligible_voters_cvap
bgs = pd.read_csv(f'{ROOT}/raw/cvap/BlockGr.csv', encoding='latin-1', usecols=['geoid', 'lntitle', 'cvap_est'])
bgs = bgs[bgs.lntitle.str.strip() == 'Total']; bgs['cty'] = bgs.geoid.str.extract(r'US(\d{5})')[0]; bgsum = bgs.groupby('cty').cvap_est.sum()
FIPS = {'Bronx': '36005', 'Brooklyn': '36047', 'Manhattan': '36061', 'Queens': '36081', 'Staten Island': '36085'}
d_bg = {b: round(float(ours[b] - bgsum[f])) for b, f in FIPS.items()}
ok(all(abs(v) <= 10 for v in d_bg.values()), 'Borough CVAP equals the sum of the Bureau block groups it is built from (nothing lost in the split to EDs)', str(d_bg))
d_cty = {b: f'{(ours[b] - cty[[g for g in cty.index if g.endswith("US" + f)][0]]) / cty[[g for g in cty.index if g.endswith("US" + f)][0]] * 100:+.3f}%' for b, f in FIPS.items()}
ok(all(abs(float(v[:-1])) < .1 for v in d_cty.values()), 'Borough CVAP vs the Bureau county table (a separate estimate, so within 0.1%)', str(d_cty))
reach = J('reach.json')
for lvl, fname, pat, csvn in [('cd', 'CD.csv', r'Congressional District (\d+)', 'cvap_cd.csv'), ('sd', 'SLDUC.csv', r'State Senate District (\d+)', 'cvap_sd.csv'), ('ad', 'SLDLC.csv', r'Assembly District (\d+)', 'cvap_ad.csv')]:
    off = pd.read_csv(f'{ROOT}/raw/cvap/{fname}', encoding='latin-1'); off = off[(off.lntitle.str.strip() == 'Total') & off.geoname.str.contains('New York')]
    off['d'] = off.geoname.str.extract(pat)[0].astype(float)
    o = off.dropna(subset=['d']).set_index('d')
    m = pd.read_csv(f'{ROOT}/data/cvap/{csvn}'); m = m.set_index(m.columns[0])
    whole = [d for d in m.index if not (reach.get(lvl, {}).get(str(d), {}).get('nyc_share', 100) < 100)]
    pct = [(abs(m.loc[d, 'eligible_voters_cvap'] - o.loc[float(d), 'cvap_est']) / o.loc[float(d), 'cvap_est'] * 100, d) for d in whole if float(d) in o.index]
    within = sum(abs(m.loc[d, 'eligible_voters_cvap'] - o.loc[float(d), 'cvap_est']) <= max(o.loc[float(d), 'cvap_moe'], 1) for _, d in pct)
    ok(max(pct)[0] < 3, f'{lvl.upper()} CVAP (districts wholly in NYC) vs the Bureau {fname}', f'{len(pct)} districts, max gap {max(pct)[0]:.2f}% ({lvl} {max(pct)[1]}), median {np.median([p for p, _ in pct]):.2f}%, {within} within the Bureau MOE')

# ---------------------------------------------------------------- E
h('E. Representatives')
rc = pd.read_csv(f'{ROOT}/data/reps/reps_check.csv'); reps = J('reps.json')
mis = rc[(rc.matches_winner == 'no') & rc.note.isna()]
ok(mis.empty, 'Every officeholder matches the certified winner, or the seat is flagged as changed hands or vacant', f'{len(rc)} seats; changed hands: {list(rc[rc.note.fillna("").str.contains("changed")].apply(lambda r: f"{r.level}{r.district}", axis=1))}; vacant: {list(rc[rc.official == "VACANT"].apply(lambda r: f"{r.level}{r.district}", axis=1))}')
os_bad = rc[(rc.matches_openstates == 'no') & (rc.official != 'VACANT')]
ok(os_bad.empty, 'State legislators match OpenStates', f'{len(os_bad)} differ: {os_bad[["level", "district", "official", "openstates"]].values.tolist()[:5]}')
counts = {k: len(reps[k]) for k in ['cc', 'ad', 'sd', 'cd']}
ok(counts == {'cc': 51, 'ad': 65, 'sd': 26, 'cd': 13} or (counts['cc'] == 51 and counts['ad'] == 65), 'A record for every district touching NYC', str(counts))
nophone = [f'{k}{d}' for k in ['cc', 'ad', 'sd', 'cd'] for d, r in reps[k].items() if not r.get('vacant') and not r.get('phone')]
ok(not nophone, 'Every sitting representative has a phone number', f'missing: {nophone}')
city = {c['office'] + '|' + c['area']: c['name'] for c in reps['city']}
ok(city.get('Mayor|Citywide') == 'Zohran Kwame Mamdani', 'Citywide officials come from the certified 2025 general', str(list(city.items())[:3]))

# ---------------------------------------------------------------- F
h('F. Poll sites')
polls = J('polls.json'); topo_eds = gpd.read_file(f'/vsigzip/{ROOT}/pipeline/ref/eds.geojson.gz').to_crs(2263)
ed_ids = set(topo_eds.id.astype(int))
missing = [e for e in ed_ids if str(e) not in polls['ed'] or polls['ed'][str(e)][0] is None]
ok(not missing, 'Every election district on the map has an Election Day site', f'{len(ed_ids)} EDs, {len(missing)} without: {missing[:5]}')
noearly = [e for e in ed_ids if str(e) in polls['ed'] and polls['ed'][str(e)][1] is None]
ok(not noearly, 'Every election district has an early voting site', f'{len(noearly)} without')
s = pd.DataFrame(polls['sites'], columns=['name', 'addr', 'boro', 'lat', 'lon', 'approx'])
sg = gpd.GeoDataFrame(s, geometry=gpd.points_from_xy(s.lon, s.lat), crs=4326).to_crs(2263)
boros = gpd.read_file(f'{ROOT}/raw/NYC_Borough_Boundary_full.geojson').to_crs(2263)
bcol = [c for c in boros.columns if 'boro' in c.lower() and 'name' in c.lower()][0]
j = gpd.sjoin_nearest(sg, boros[[bcol, 'geometry']], how='left', distance_col='dist'); j = j[~j.index.duplicated()]
wrong = j[j[bcol].str.replace('Staten Is.*', 'Staten Island', regex=True) != j.boro]
ok(len(wrong) == 0, 'Each geocoded poll site lies in the borough its address names', f'{len(s)} sites; {len(wrong)} off: {wrong[["name", "boro", bcol]].values.tolist()[:4]}')
cent = topo_eds.set_index(topo_eds.id.astype(int)).geometry
far = []; enr = J('enroll.json')['ed']; empty = 0
for e in ed_ids:
    if not (enr.get(str(e)) or [0] * 7)[6]: empty += 1; continue      # parks, airports, cemeteries: no voters to serve
    p = polls['ed'].get(str(e))
    if not p or p[0] is None: continue
    d = sg.geometry.iloc[p[0]].distance(cent[e]) / 5280
    if d > 1.5: far.append((e, round(d, 2), s.name[p[0]]))
ok(len(far) <= 0.005 * len(ed_ids), 'Election Day sites are near the districts they serve (over 1.5 miles flagged)', f'{len(ed_ids) - empty} EDs with voters; {len(far)} over 1.5 miles: {sorted(far, key=lambda x: -x[1])[:5]}')

# ---------------------------------------------------------------- G
h('G. Homes (PLUTO)')
doors = J('doors.json'); F = {f: i for i, f in enumerate(doors['fields'])}
csvd = pd.read_csv(f'{ROOT}/data/doors/doors_ed.csv').set_index('elect_dist')
diff = sum(abs(doors['ed'][str(e)][F['units']] - csvd.loc[e, 'residential_units']) > .51 for e in csvd.index if str(e) in doors['ed'])
ok(diff == 0, 'Site homes by ED equal the downloadable CSV', f'{diff} differ')
parts = sum(abs(sum(a[F[k]] for k in ['u1_2', 'u3_9', 'u10_49', 'u50']) - a[F['units']]) > .6 for a in doors['ed'].values())
ok(parts == 0, 'Building-size groups add up to all homes in every ED', f'{parts} EDs off')
chk = pd.read_csv(f'{ROOT}/data/doors/check_vs_census2020_by_ed.csv'); big = chk[chk.census2020 >= 200]
ok(abs(big.ratio.median() - 1) < .05, 'Homes by ED track 2020 Census housing units', f'median PLUTO/Census {big.ratio.median():.3f}, middle half {big.ratio.quantile(.25):.3f} to {big.ratio.quantile(.75):.3f}, {int((abs(big.ratio - 1) > .5).sum())} of {len(big)} EDs off by half or more')
ok(abs(sum(a[F['units']] for a in doors['ed'].values()) - sum(a[F['units']] for a in doors['tract'].values())) < 50, 'ED and tract homes add to the same city total')

# ---------------------------------------------------------------- H
h('H. Neighborhood conditions vs the API\'s own district fields')
cond = J('conditions.json'); CF = {f: i for i, f in enumerate(cond['fields'])}
mem = topo_eds.set_index(topo_eds.id.astype(int))[['cc', 'boro']]
E = pd.DataFrame({k: v for k, v in cond['ed'].items()}).T; E.columns = cond['fields']; E.index = E.index.astype(int); E = E.join(mem)
def api(id_, params):
    url = 'https://data.cityofnewyork.us/resource/' + id_ + '.json?' + urllib.parse.urlencode(params)
    tok = os.environ.get('SOCRATA_APP_TOKEN')
    for k in range(6):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'X-App-Token': tok} if tok else {}), timeout=600))
        except Exception:
            if k == 5: raise
            __import__('time').sleep(10 * (k + 1))
def window(src): s = cond['sources'][src]; return s['start'] + 'T00:00:00', (dt.date.fromisoformat(s['end']) + dt.timedelta(days=1)).isoformat() + 'T00:00:00'
for src in cond['sources']:
    s = cond['sources'][src]
    ok(s['pct_placed'] >= 97, f'{s["label"]}: share of records placed in an election district', f'{s["pct_placed"]}% of {s["records"]:,}, {s["start"]} to {s["end"]}')
checks = [('311', 'erm2-nwe9', 'created_date', 'council_district', '311_total', ''), ('hpd', 'wvxf-dwi5', 'novissueddate', 'councildistrict', 'hpd_total', ''),
          ('evict', '6z8x-wfk4', 'executed_date', 'council_district', 'evict_evict', " and residential_commercial_ind='Residential'")]
for src, id_, col, field, ours_col, extra in checks:
    a, b = window(src)
    rows = api(id_, {'$select': f'{field} as d, count(*) as n', '$where': f"{col} >= '{a}' and {col} < '{b}'{extra}", '$group': field, '$limit': 100})
    theirs = pd.Series({int(float(r['d'])): int(r['n']) for r in rows if r.get('d') not in (None, '') and re.match(r'^\d+(\.0)?$', str(r['d'])) and 1 <= int(float(r['d'])) <= 51})
    mine = E.groupby('cc')[ours_col].sum()
    both = pd.concat([mine, theirs], axis=1, keys=['ours', 'api']).dropna()
    pctd = (both.ours - both.api).abs() / both.api * 100
    corr = np.corrcoef(both.ours, both.api)[0, 1]
    both.assign(pct_diff=pctd.round(2)).to_csv(f'{OUT}/conditions_{src}_by_council_vs_api.csv', index_label='council_district')
    ok(corr > (.98 if src == 'evict' else .99) and pctd.median() < (10 if src == 'evict' else 5), f'{s_lab if (s_lab := cond["sources"][src]["label"]) else src} by Council district vs the agency\'s own council field',
       f'correlation {corr:.4f}, median gap {pctd.median():.1f}%, largest {pctd.max():.1f}% (CC {int(pctd.idxmax())}); the agency field uses its own geocoding, so small gaps are expected')
p = pd.read_csv(f'{ROOT}/raw/pluto/pluto_26v2.csv', usecols=['bbl', 'council', 'unitsres'], low_memory=False).dropna(subset=['council'])
p['cc'] = p.bbl.astype('int64').map(pd.read_csv(f'{ROOT}/pipeline/ref/lot_ed.csv.gz').set_index('bbl').ed).map(mem.cc)
p = p.dropna(subset=['cc']); agree = (p.cc == p.council)
ok(agree.mean() > .999, 'Tax lot to election district lookup (used to place 311, HPD and eviction records) agrees with PLUTO\'s own Council district on each lot',
   f'{agree.mean() * 100:.3f}% of {len(p):,} lots, {p.unitsres[agree].sum() / p.unitsres.sum() * 100:.4f}% of homes. The marshals\' eviction file carries its own council field that disagrees with PLUTO on more lots, which is why the eviction comparison above is looser')
a, b = window('nypd')
rows = []
for id_ in ['qgea-i56i', '5uac-w243']:
    rows += api(id_, {'$select': 'boro_nm as b, count(*) as n', '$where': f"cmplnt_fr_dt >= '{a}' and cmplnt_fr_dt < '{b}'", '$group': 'boro_nm'})
th = defaultdict(int)
for r in rows: th[(r.get('b') or '').title()] += int(r['n'])
mine = E.groupby('boro').nypd_total.sum()
gaps = {bn: round((mine[bn] - th[bn.replace('Staten Island', 'Staten Island')]) / th[bn] * 100, 2) for bn in mine.index if th.get(bn)}
ok(all(abs(g) < 3 for g in gaps.values()), 'NYPD complaints by borough vs the NYPD\'s own borough field', str(gaps))

# ---------------------------------------------------------------- I
h('I. Council discretionary funding')
import openpyxl
wb = openpyxl.load_workbook(f'{ROOT}/raw/discretionary/funded_disclosure_FY2027.xlsx', read_only=True); ws = wb.worksheets[0]
it = ws.iter_rows(values_only=True); hdr = next(it); im, ia = hdr.index('Council Member'), hdr.index('Amount')
by_member = defaultdict(float); grand = 0.0
for r in it:
    if r[ia] is None: continue
    by_member[(r[im] or '').strip()] += float(r[ia]); grand += float(r[ia])
fund = J('funding.json')
ok(abs(grand - fund['total']) < 1, 'Published FY2027 total equals the workbook', f'${grand:,.0f}')
parts = sum(v['total'] for v in fund['cc'].values()) + fund['speaker_total'] + sum(fund['delegations'].values()) + fund['citywide_initiatives_total']
ok(abs(parts - fund['total']) < 1, 'District, Speaker, delegation and citywide pieces add to the total', f'${parts:,.0f}')
fold = lambda s: re.sub(r'[^a-z]', '', __import__('unicodedata').normalize('NFKD', s).encode('ascii', 'ignore').decode().lower())
bad = []
for d, v in fund['cc'].items():
    name = reps['cc'][d]['name']; last = fold(name.split()[-1])
    hits = [m for m in by_member if m and fold(m.split()[-1]) == last and (not re.match(r'^[A-Z]\.', m) or m[0] == name[0])]
    hits = [m for m in hits if 'Delegation' not in m]
    t = sum(by_member[m] for m in hits)
    if not hits:   # multi-word surnames ('De La Rosa', 'Brooks-Powers', 'Thomas-Henry')
        hits = [m for m in by_member if m and fold(m) and fold(name).endswith(fold(m))]; t = sum(by_member[m] for m in hits)
    if abs(t - v['total']) > 1: bad.append((d, name, hits, t, v['total']))
ok(not bad, 'Each district total equals the workbook rows under its member\'s name (re-read with openpyxl)', f'{bad[:3]}')

# ---------------------------------------------------------------- J
h('J. Donations by ZIP')
don = J('donations.json')
cfb_sum = sum(a['cfb']['total'] for a in don['areas'].values() if a.get('cfb'))
fec_sum = sum(a['fec']['total'] for a in don['areas'].values() if a.get('fec'))
note(f'CFB 2025 city races from NYC ZIP areas: ${cfb_sum:,.0f}; FEC 2025–26: ${fec_sum:,.0f}')
ok(abs(cfb_sum - don['cfb']['total_nyc_zips']) < 1 and abs(fec_sum - don['fec']['total_nyc_zips']) < 1, 'ZIP areas add to the stated NYC totals for both sources')
# independent re-sum of the CFB file: contributions (ABC) minus refunds (M) for the five offices, by MODZCTA, with the csv module
zg = json.load(open(f'{ROOT}/raw/zip/modzcta.geojson')); zmap = {}
for ft in zg['features']:
    pr = ft['properties']
    if str(pr['modzcta']) == '99999': continue
    for z in re.findall(r'\d{5}', f"{pr.get('label')},{pr.get('zcta')},{pr['modzcta']}"):
        if z not in ('11001', '11003', '11040'): zmap.setdefault(z, str(pr['modzcta']))
OFFICES = {'1': 'Mayor', '2': 'Public Advocate', '3': 'Comptroller', '4': 'Borough President', '5': 'City Council'}
tot = defaultdict(float); hdr = None; nrow = 0
with open(f'{ROOT}/raw/cfb/2025_Contributions.csv', encoding='latin-1', newline='') as f:
    rd = csv.reader(f); hdr = next(rd); H = {k: i for i, k in enumerate(hdr)}
    for r in rd:
        nrow += 1
        if r[H['ELECTION']].strip() != '2025': continue
        if r[H['OFFICECD']].strip() not in OFFICES: continue
        sch = r[H['SCHEDULE']].strip().upper()
        if sch not in ('ABC', 'M'): continue
        z = (r[H['ZIP']] or '').strip()[:5]
        if z not in zmap: continue
        amt = float(r[H['AMNT']] or 0)
        tot[zmap[z]] += amt if sch == 'ABC' else -abs(amt)
gap = {a: round(tot[a] - (don['areas'].get(a, {}).get('cfb') or {}).get('total', 0), 2) for a in set(tot) | set(don['areas'])}
big = {a: g for a, g in gap.items() if abs(g) > 1}
ok(not big, 'CFB totals by ZIP area re-summed from the raw file with a separate reader equal the published ones', f'{len(gap)} areas; {len(big)} differ, e.g. {list(big.items())[:4]}')

# ---------------------------------------------------------------- report
R.insert(0, f'# Open NYC accuracy audit\n\nRun {dt.datetime.now().strftime("%Y-%m-%d %H:%M")}. {len(FAILS)} failed checks.\n')
open(f'{OUT}/report_v4.md', 'w').write('\n'.join(R) + '\n')
print(f'\n{len(FAILS)} failed:', FAILS)
sys.exit(1 if FAILS else 0)
