"""Parse the BOE poll site lists (Nov 3, 2026 general) into ED -> site rows."""
import re, glob, sys, pdfplumber, pandas as pd
COUNTY = {'Bronx': 'Bronx', 'Kings': 'Brooklyn', 'New_York': 'Manhattan', 'Queens': 'Queens', 'Richmond': 'Staten Island'}

def parse(f):
    rows, issues = [], []
    with pdfplumber.open(f) as pdf:
        for pn, page in enumerate(pdf.pages):
            W = page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False)
            heads = [w for w in W if w['text'] == 'ED' and any(v['text'] == 'SITE' and abs(v['top'] - w['top']) < 3 for v in W)]
            if not heads: continue
            htop = min(w['top'] for w in heads)
            cols = []
            for x in sorted(w['x0'] for w in heads):
                if not cols or x - cols[-1] > 20: cols.append(x)
            ads = []
            for w in W:
                m = re.fullmatch(r'(\d+)(st|nd|rd|th)', w['text'])
                if m and any(v['text'] == 'Assembly' and abs(v['top'] - w['top']) < 10 and 0 < v['x0'] - w['x1'] < 15 for v in W):
                    ads.append((w['x0'], w['top'], int(m.group(1))))
            colads = []          # per column: [(top, AD)], a column can hold several Assembly districts stacked
            for i, x in enumerate(cols):
                right = cols[i + 1] if i + 1 < len(cols) else 1e9
                colads.append(sorted((t, a) for ax, t, a in ads if x - 10 <= ax < right - 10))
                if not colads[-1]: issues.append((f, pn, 'column without AD', x))
            def ad_at(i, top):
                c = [a for t, a in colads[i] if t < top]
                return c[-1] if c else None
            lines = {}
            for w in W:
                if w['top'] <= htop + 3: continue
                lines.setdefault(round(w['top'] / 3), []).append(w)
            for k in sorted(lines):
                ws = sorted(lines[k], key=lambda w: w['x0'])
                for i, x in enumerate(cols):
                    right = cols[i + 1] if i + 1 < len(cols) else 1e9
                    cw = [w for w in ws if x - 4 <= w['x0'] < right - 4]
                    if not cw: continue
                    if not re.fullmatch(r'\d{3}', cw[0]['text']):
                        t = ' '.join(w['text'] for w in cw)
                        if '..' in t: issues.append((f, pn, 'no ED', t))
                        continue
                    ed = int(cw[0]['text']); rest = ' '.join(w['text'] for w in cw[1:])
                    parts = re.split(r'\s*(?:\.{2,}|…+)\s*', rest, maxsplit=1)
                    name, addr = (parts[0].strip(), parts[1].strip()) if len(parts) == 2 else (rest, '')
                    addr = re.sub(r'^[.…\s]+', '', addr)
                    if not addr: issues.append((f, pn, 'no address', ed, rest))
                    ad = ad_at(i, cw[0]['top'])
                    if ad is None: issues.append((f, pn, 'row without AD', ed)); continue
                    rows.append(dict(ad=ad, ed=ed, elect_dist=ad * 1000 + ed, site=name, address=addr))
    return rows, issues

if __name__ == '__main__':
    out = []
    for f in sorted(glob.glob('raw/polls/*.pdf')):
        kind = 'early' if 'Early_Voting' in f else 'eday'
        boro = next(v for k, v in COUNTY.items() if k in f)
        rows, issues = parse(f)
        for r in rows: r.update(kind=kind, boro=boro)
        out += rows
        print(f.split('/')[-1], len(rows), 'issues', len(issues)); [print('  ', i) for i in issues[:8]]
    pd.DataFrame(out).to_csv('data/polls_raw.csv', index=False)
