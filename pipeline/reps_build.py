"""Who represents each district, from the official rosters, checked two ways:
against the certified winners in our own results files, and against OpenStates.

Sources (saved under raw/reps/):
  council.html + council/d<N>.html   council.nyc.gov district list and member pages
  assembly.html                      nyassembly.gov/mem
  senate.html                        nysenate.gov/senators-committees
  house.xml                          clerk.house.gov MemberData.xml
  congress.yaml                      unitedstates/congress-legislators (websites)
  ny_openstates.csv                  OpenStates people (district contact for senators)
Output: site/data/reps.json, data/reps/representatives.csv, data/reps/reps_check.csv
"""
import os, re, csv, json, html, unicodedata
import xml.etree.ElementTree as ET
import yaml

ROOT = os.environ.get('CITYOPEN_ROOT', os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = os.environ.get('SITE_DIR', f'{ROOT}/site')
R = f'{ROOT}/raw/reps'
OUT = f'{ROOT}/data/reps'; os.makedirs(OUT, exist_ok=True)
AS_OF = '2026-10-22'
NEXT_ELECTION = {'ad': '2026-11-03', 'sd': '2026-11-03', 'cd': '2026-11-03', 'cc': '2029-11-06'}
txt = lambda s: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()
PARTY = {'D': 'Democrat', 'R': 'Republican', 'Democratic': 'Democrat', 'Democrat': 'Democrat', 'Republican': 'Republican'}

def lines_of(block):
    return [txt(x) for x in re.split(r'<br\s*/?>', block) if txt(x)]

PHONE = re.compile(r'\(?(\d{3})\)?[\s.\-]*(\d{3})[\s.\-]+(\d{4})')
def office_from(ls):
    """address lines and the main phone from a contact block; fax, email and hours lines are left out"""
    phone = next((PHONE.search(l) for l in ls if PHONE.search(l) and 'fax' not in l.lower()), None)
    phone = '-'.join(phone.groups()) if phone else ''
    addr = [l for l in ls if not PHONE.search(l) and not re.search(r'hours|appointment|^fax|^e-?mail|@|^phone|contact (my|our|the) office', l, re.I)]
    a0 = next((i for i, l in enumerate(addr) if re.match(r'^\d', l)), 0)      # starts at the street number
    addr = addr[a0:]
    z = next((i for i, l in enumerate(addr) if re.search(r'\b1\d{4}\b', l)), None)
    if z is not None: addr = addr[:z + 1]          # the address ends at its ZIP code line
    return re.sub(r'\s*,(\s*,)+', ',', ', '.join(addr)).strip(' ,'), phone

def council():
    t = open(f'{R}/council.html', encoding='utf-8', errors='replace').read()
    out = {}
    for row in re.findall(r'<tr>(.*?)</tr>', t, re.S):
        d = re.search(r'sort-district.*?<strong>(\d+)</strong>', row, re.S)
        if not d: continue
        d = int(d.group(1))
        name = html.unescape(re.search(r'data-member-name="([^"]+)"', row).group(1)).strip()
        party = txt(re.search(r'sort-party[^>]*>(.*?)</td>', row, re.S).group(1))
        email = re.search(r'mailto:([^"]+)"', row); hoods = txt(re.search(r'sort-neighborhoods[^>]*>(.*?)</td>', row, re.S).group(1))
        page = open(f'{R}/council/d{d}.html', encoding='utf-8', errors='replace').read()
        m = re.search(r'<h2 class="widget-title">District Office</h2><p class="text-small">(.*?)</p>', page, re.S)
        addr, phone = office_from(lines_of(m.group(1))) if m else ('', '')
        url = re.search(r'<link rel="canonical" href="([^"]+)"', page)
        tm = re.match(r'^(Speaker|Deputy Speaker|Majority Leader|Majority Whip|Minority Leader|Minority Whip)\s+(?:Dr\.\s+)?(.*)$', name)
        title = tm.group(1) if tm else ''
        if tm: name = tm.group(2).strip()
        out[d] = dict(name=name, title=title, party=PARTY.get(party, party), email=email.group(1) if email else '', office=addr, phone=phone,
                      url=url.group(1) if url else f'https://council.nyc.gov/district-{d}/', area=hoods)
    assert len(out) == 51, f'council rows {len(out)}'
    return out

def assembly():
    t = open(f'{R}/assembly.html', encoding='utf-8', errors='replace').read()
    out = {}
    for d, body in re.findall(r'<section class="mem-item" id="(\d+)">(.*?)</section>', t, re.S):
        d = int(d)
        nm = re.search(r'<h3 class="mem-name"><a[^>]*href="([^"]+)"[^>]*>(.*?)<span>', body, re.S)
        if not nm: out[d] = None; continue
        addrs = re.findall(r'<div class="full-addr notranslate">(.*?)</div>', body, re.S)
        addr, phone = office_from(lines_of(addrs[0])) if addrs else ('', '')
        email = re.search(r'mailto:([^"]+)"', body)
        out[d] = dict(name=txt(nm.group(2)), party='', email=email.group(1) if email else '', office=addr, phone=phone,
                      url='https://nyassembly.gov' + nm.group(1))
    return out

def senate():
    t = open(f'{R}/senate.html', encoding='utf-8', errors='replace').read()
    items = re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(?:(?!</a>).)*?nys-senator--name">([^<]+)</h2>\s*<span class="nys-senator--district">\s*'
                       r'<span class="nys-senator--party">\s*\(([^)]*)\)\s*</span>\s*(\d+)\w\w District', t, re.S)
    return {int(d): dict(name=html.unescape(n).strip(), party=PARTY.get(p.split(',')[0].strip(), p), party_lines=p, url=u) for u, n, p, d in items}

def house():
    r = ET.parse(f'{R}/house.xml').getroot()
    sites = {}
    for p in yaml.safe_load(open(f'{R}/congress.yaml')):
        t = p['terms'][-1]
        if t['type'] == 'rep' and t['state'] == 'NY': sites[t['district']] = (t.get('url', ''), p['id'].get('bioguide'))
    out = {}
    for m in r.iter('member'):
        sd = m.findtext('statedistrict') or ''
        if not sd.startswith('NY'): continue
        d = int(sd[2:]); mi = m.find('member-info')
        name = (mi.findtext('official-name') or '').strip()
        if not name: out[d] = None; continue
        bio = mi.findtext('bioguideID')
        url, ybio = sites.get(d, ('', None))
        out[d] = dict(name=name, party=PARTY.get(mi.findtext('party'), mi.findtext('party')),
                      office=f"{mi.findtext('office-room')} {mi.findtext('office-building')}, Washington, DC".strip(),
                      phone=(mi.findtext('phone') or '').replace('(', '').replace(') ', '-'), url=url if ybio == bio else '', bioguide=bio)
    return out

def norm(n):
    n = unicodedata.normalize('NFKD', n).encode('ascii', 'ignore').decode()
    n = re.sub(r'\b(Jr|Sr|II|III|IV)\b\.?', '', n); n = re.sub(r'\b[A-Z]\.\s*', '', n)
    return re.sub(r'[^a-z ]', '', n.lower()).split()

def same(a, b):
    a, b = norm(a), norm(b)
    return bool(a and b) and a[-1] == b[-1]

def winners(eid, office_pat):
    e = json.load(open(f'{SITE}/data/results/{eid}.json'))
    out = {}
    for c in e['contests']:
        if c['party'] or not re.search(office_pat, c['office'], re.I): continue
        out[c['scope'][1]] = (c['candidates'][0]['name'], c['candidates'][0]['votes'], c['candidates'][1]['votes'] if len(c['candidates']) > 1 else 0)
    return out

def main():
    edm = json.load(open(f'{SITE}/data/results/2026-primary.json'))['eds']
    nyc = {k: sorted({v[i] for v in edm.values() if v[i] is not None}) for i, k in enumerate(['cc', 'ad', 'sd', 'cd'])}
    roster = {'cc': council(), 'ad': assembly(), 'sd': senate(), 'cd': house()}
    os_rows = list(csv.DictReader(open(f'{R}/ny_openstates.csv')))
    osk = {(('ad' if r['current_chamber'] == 'lower' else 'sd'), int(r['current_district'])): r for r in os_rows}
    W = {'cc': winners('2025-general', r'City Council'), 'ad': winners('2024-general', r'Member of Assembly|Assembly Member'),
         'sd': winners('2024-general', r'^State Senator'), 'cd': winners('2024-general', r'Congress')}
    checks, reps = [], {}
    for lvl, ids in nyc.items():
        reps[lvl] = {}
        for d in ids:
            p = roster[lvl].get(d)
            w = W[lvl].get(d)
            if p and lvl == 'ad':
                o = osk.get(('ad', d))
                if o and same(o['name'], p['name']): p['party'] = PARTY.get(o['current_party'].split('/')[0], o['current_party'].split('/')[0])
            if p and lvl == 'sd':
                o = osk.get(('sd', d))
                if o and same(o['name'], p['name']): p['office'] = o['district_address']; p['phone'] = o['district_voice']; p['email'] = o['email']
            note = ''
            if not p: note = 'vacant on the official roster'
            elif w and not same(w[0], p['name']): note = f'elected {w[0]}; seat changed hands after the election'
            o = osk.get((lvl, d)) if lvl in ('ad', 'sd') else None
            checks.append(dict(level=lvl, district=d, official=p['name'] if p else 'VACANT', certified_winner=w[0] if w else '',
                               matches_winner='' if not w else ('yes' if p and same(w[0], p['name']) else 'no'),
                               openstates=o['name'] if o else '', matches_openstates='' if lvl not in ('ad', 'sd') else ('yes' if o and p and same(o['name'], p['name']) else 'no'), note=note))
            rec = dict(p) if p else {'vacant': True, 'name': 'Vacant'}
            if w: rec['last_election'] = {'winner': w[0], 'votes': w[1], 'runner_up_votes': w[2]}
            if w and p and not same(w[0], p['name']): rec['took_office_after_last_general'] = True
            rec['next_election'] = NEXT_ELECTION[lvl]
            reps[lvl][str(d)] = rec
    # citywide and borough offices: certified 2025 general winners
    g = json.load(open(f'{SITE}/data/results/2025-general.json'))
    city = []
    for c in g['contests']:
        if c['party'] or c['scope'][0] not in ('city', 'boro'): continue
        if not re.match(r'Mayor|Public Advocate|Comptroller|City Comptroller|Borough President', c['office']): continue
        city.append(dict(office=c['office'], area=c['scope_name'] if c['scope'][0] == 'boro' else 'Citywide', name=c['candidates'][0]['name'],
                         votes=c['candidates'][0]['votes'], elected='2025-11-04', took_office='2026-01-01'))
    reps['city'] = city
    reps['as_of'] = AS_OF
    reps['sources'] = {'cc': 'council.nyc.gov', 'ad': 'nyassembly.gov', 'sd': 'nysenate.gov (district office: OpenStates)', 'cd': 'clerk.house.gov', 'city': 'NYC BOE certified results, 2025 general'}
    json.dump(reps, open(f'{SITE}/data/reps.json', 'w'), separators=(',', ':'), ensure_ascii=False)
    with open(f'{OUT}/reps_check.csv', 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=list(checks[0])); w.writeheader(); w.writerows(checks)
    with open(f'{OUT}/representatives.csv', 'w', newline='') as f:
        cols = ['level', 'district', 'name', 'party', 'phone', 'email', 'office', 'url', 'next_election']
        w = csv.writer(f); w.writerow(cols)
        for lvl in ['cc', 'ad', 'sd', 'cd']:
            for d, r in reps[lvl].items(): w.writerow([lvl, d] + [r.get(c, '') for c in cols[2:]])
        for r in city: w.writerow(['citywide' if r['area'] == 'Citywide' else 'borough', r['area'], r['name'], '', '', '', '', '', ''])
    for c in checks:
        if c['note'] or c['matches_openstates'] == 'no': print(c)
    print({k: len(v) for k, v in nyc.items()}, 'citywide/borough offices', len(city))

if __name__ == '__main__':
    main()
