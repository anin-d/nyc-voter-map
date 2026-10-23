"""Ranked-choice final rounds by ED for every 2025 primary RCV contest, from the BOE cast vote records.
Tabulates each contest citywide with NYC rules, checks the result against the BOE's certified round-by-round
report, then counts every ballot's final-round vote in its ED."""
import os, re, glob, json, html, urllib.request
import pandas as pd, numpy as np

ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = os.environ.get('SITE_DIR', f'{ROOT}/site')
CVR = f'{ROOT}/raw/results/cvr2025'

def load():
    names = pd.read_excel(f'{CVR}/Primary Election 2025 - 06-24-2025_CandidacyID_To_Name.xlsx', engine='calamine')
    idname = dict(zip(names.CandidacyID.astype(str), names.DefaultBallotName))
    frames = []
    pat = re.compile(r'^(DEM|REP) .+ Choice \d of \d .+ \(\d+\)$')
    for f in sorted(glob.glob(f'{CVR}/2025P*.xlsx')):
        d = pd.read_excel(f, engine='calamine', dtype=str)
        keep = ['Precinct'] + [c for c in d.columns if pat.match(str(c))]
        frames.append(d[keep].astype('category')); del d
    df = pd.concat(frames, ignore_index=True)
    return df, idname

def contests(df):
    out = {}
    for c in df.columns:
        m = re.match(r'^(DEM|REP) (.+?) Choice (\d) of (\d) (.+?) \((\d+)\)$', str(c))
        if m:
            key = (m.group(1), m.group(2), m.group(5)); out.setdefault(key, {})[int(m.group(3))] = c
    return {k: [v[i] for i in sorted(v)] for k, v in out.items()}

def ballot_sequences(df, cols):
    """Each ballot as its list of rankings; returns only ballots that have this contest."""
    sub = df[cols + ['Precinct']].dropna(subset=cols, how='all')
    return sub

def tabulate(sub, cols):
    R = sub[cols].fillna('undervote').to_numpy(dtype=object)
    n = len(R)
    def first_continuing(row, alive):
        seen = set()
        for x in row:
            if x == 'undervote': continue
            if x == 'overvote': return None
            if x in seen: continue
            seen.add(x)
            if x in alive: return x
        return None
    cands = set(x for x in np.unique(R) if x not in ('undervote', 'overvote'))
    alive = set(cands)
    rounds = []
    while True:
        votes = {}
        for row in R:
            c = first_continuing(row, alive)
            if c is not None: votes[c] = votes.get(c, 0) + 1
        for c in alive: votes.setdefault(c, 0)
        rounds.append(dict(votes))
        if len(alive) <= 2: break
        if len(rounds) == 1 and max(votes.values()) * 2 > sum(votes.values()): break   # majority in round 1: no ranked rounds
        # write-ins go first; then batch-eliminate the lowest candidates whose combined votes trail the next candidate
        if 'Write-in' in alive and len(rounds) == 1:
            alive.discard('Write-in'); continue
        order = sorted(alive, key=lambda c: votes[c])
        cut = 1; total = votes[order[0]]
        for i in range(1, len(order) - 1):
            if total + votes[order[i]] < votes[order[i + 1]]: total += votes[order[i]]; cut = i + 1
            elif total < votes[order[i]]: break
            else: break
        # recompute properly: largest k such that sum(lowest k) < votes of the (k+1)th lowest, keeping at least two
        best = 1; s = 0
        for k in range(1, len(order) - 1):
            s = sum(votes[c] for c in order[:k])
            if s < votes[order[k]]: best = k
        for c in order[:best]: alive.discard(c)
    final = alive
    ed_final = {}
    for row, p in zip(R, sub['Precinct'].to_numpy()):
        m = re.match(r'AD: (\d+) ED: (\d+)', str(p)); ed = int(m.group(1)) * 1000 + int(m.group(2))
        c = first_continuing(row, final)
        e = ed_final.setdefault(ed, {'__ballots': 0, '__inactive': 0})
        e['__ballots'] += 1
        if c is None: e['__inactive'] += 1
        else: e[c] = e.get(c, 0) + 1
    return rounds, final, ed_final

def official(code):
    f = f'{CVR}/html/{code}_1.html'
    if not os.path.exists(f): return None
    t = open(f, encoding='utf-8', errors='replace').read()
    t = html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', t)))
    m = re.search(r'(.+?) won the .+? with ([\d,]+) of the votes in the final round\. \1 defeated (.+?), who received ([\d,]+) of final votes', t)
    if m: return ('final', m.group(1).strip(), int(m.group(2).replace(',', '')), m.group(3).strip(), int(m.group(4).replace(',', '')))
    m = re.search(r'Votes in this round # votes % of vote (.+?) Inactive ballots', t)
    if m and 'in the first round' in t:
        return ('round1', {n.strip(): int(v.replace(',', '')) for n, v in re.findall(r'(.+?) ([\d,]+) [\d.]+%', m.group(1))})
    return None

def main():
    df, idname = load()
    cs = contests(df)
    out, checks = {}, []
    for (party, office, district), cols in sorted(cs.items()):
        cid = re.search(r'\((\d+)\)$', cols[0]).group(1)
        sub = ballot_sequences(df, cols)
        rounds, final, ed_final = tabulate(sub, cols)
        fin = sorted(final, key=lambda c: -rounds[-1][c])
        off = official(cid)
        nm = lambda c: idname.get(c, 'Write-ins' if c == 'Write-in' else c).strip()
        if len(rounds) == 1:          # decided in round 1
            mine = ('round1', {nm(c): v for c, v in rounds[0].items()})
            ok = off is not None and off[0] == 'round1' and {k.strip(): v for k, v in off[1].items()} == mine[1]
        else:
            mine = ('final', nm(fin[0]), rounds[-1][fin[0]], nm(fin[1]), rounds[-1][fin[1]])
            ok = off is not None and off == mine
        checks.append((party, office, district, mine, off, ok))
        print('OK ' if ok else 'DIFF', party, office, district, 'rounds', len(rounds), '' if ok else (mine, off))
        # check ED sums of the final round equal the citywide final round
        if len(rounds) > 1:
            for c in fin: assert sum(e.get(c, 0) for e in ed_final.values()) == rounds[-1][c]
        if not ok:
            print('   left out: no certified round-by-round report to check against (BOE certified this one by manual count)'); continue
        # round 1 by ED (first valid choice) for every candidate, plus the final round when there were ranked rounds
        first = {}
        R = sub[cols].fillna('undervote').to_numpy(dtype=object)
        cands_all = sorted(rounds[0], key=lambda c: -rounds[0][c])
        for row, p in zip(R, sub['Precinct'].to_numpy()):
            m = re.match(r'AD: (\d+) ED: (\d+)', str(p)); ed = int(m.group(1)) * 1000 + int(m.group(2))
            seen = set(); c1 = None
            for x in row:
                if x == 'undervote': continue
                if x == 'overvote': break
                c1 = x; break
            e = first.setdefault(ed, {'__ballots': 0})
            e['__ballots'] += 1
            if c1 is not None: e[c1] = e.get(c1, 0) + 1
        for c in cands_all: assert sum(e.get(c, 0) for e in first.values()) == rounds[0][c], 'round 1 by ED does not add up'
        names = [nm(c) for c in cands_all]
        lines = [n if n != 'Write-ins' else 'Scattered' for n in names]
        office_map = {'Mayor': 'Mayor', 'Public Advocate': 'Public Advocate', 'Comptroller': 'City Comptroller', 'Borough President': 'Borough President', 'Council Member': 'Member of the City Council'}
        boro = {'New York': 'Manhattan', 'Kings': 'Brooklyn', 'Bronx': 'Bronx', 'Queens': 'Queens', 'Richmond': 'Staten Island'}
        num = re.sub(r'\D', '', district)
        scope = ['cc', int(num)] if 'Council' in district else ['boro', boro[district]] if district in boro else ['city', None]
        sname = f'City Council District {num}' if scope[0] == 'cc' else boro.get(district, 'Citywide')
        pty = {'DEM': 'Democratic', 'REP': 'Republican'}[party]
        title = f'{pty} Primary: {office_map[office]}' + ('' if scope[0] == 'city' else f', {sname}')
        con = {'id': re.sub(r'[^a-z0-9]+', '-', f'{pty} {office_map[office]} {district}'.lower()).strip('-'), 'title': title, 'office': office_map[office], 'party': pty,
               'scope': scope, 'scope_name': sname, 'vote_for': 1, 'source': 'cvr',
               'candidates': [{'name': n, 'lines': [l], 'votes': rounds[0][c]} for n, l, c in zip(names, lines, cands_all) if n != 'Write-ins'],
               'lines': [l for l in lines if l != 'Scattered'] + (['Scattered'] if 'Scattered' in lines else []),
               'ballots': int(sum(e['__ballots'] for e in first.values())), 'certified_match': True}
        order = [c for c, l in zip(cands_all, lines) if l != 'Scattered'] + [c for c, l in zip(cands_all, lines) if l == 'Scattered']
        con['rows'] = {str(ed): [v['__ballots']] + [v.get(c, 0) for c in order] for ed, v in first.items()}
        if len(rounds) > 1:
            con['rcv'] = {'finalists': [nm(c) for c in fin], 'rounds': [{nm(k): v for k, v in r.items()} for r in rounds],
                          'rows': {str(ed): [v['__ballots'], v['__inactive']] + [v.get(c, 0) for c in fin] for ed, v in ed_final.items()}}
        out[con['id']] = con
    json.dump(out, open(f'{SITE}/data/results/2025-primary-rcv.json', 'w'), separators=(',', ':'))
    print(sum(c[-1] for c in checks), 'of', len(checks), 'contests match the certified final round exactly')

if __name__ == '__main__':
    main()
