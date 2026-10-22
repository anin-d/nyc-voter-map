import pandas as pd, sqlite3, os
P = ['DEM','REP','CON','WOR','OTH','BLANK','TOTAL']
L = pd.read_csv('data/enrollment_long.csv')
xw = pd.read_csv('data/ed_crosswalk_raw.csv').rename(columns={'ElectDist':'elect_dist','cc':'council_district','ad':'assembly_district','sd':'senate_district','cd':'congressional_district'})
# wide ED table
W = L.pivot_table(index=['elect_dist','borough','boro_code','ad','ed'], columns='status', values=P, aggfunc='sum').fillna(0).astype(int)
W.columns = [f'{p.lower()}_{s}' for p,s in W.columns]
W = W.reset_index().rename(columns={'ad':'ad_code','ed':'ed_number'})
order = ['elect_dist','borough','boro_code','ad_code','ed_number']
cols = [f'{p.lower()}_{s}' for s in ['total','active','inactive'] for p in P]
W = W[order+cols]
ed = W.merge(xw[['elect_dist','council_district','assembly_district','senate_district','congressional_district']], on='elect_dist', how='left')
ed['has_boundary'] = ed.council_district.notna().astype(int)
ed['assembly_district'] = ed.assembly_district.fillna(ed.ad_code)
for c in ['council_district','assembly_district','senate_district','congressional_district']: ed[c]=ed[c].astype('Int64')
ed = ed.drop(columns='ad_code')
ed.insert(0,'as_of','2026-02-20')
os.makedirs('out', exist_ok=True)
ed.to_csv('out/election_districts_enrollment.csv', index=False)
# zero-voter boundary EDs for completeness
zero = xw[~xw.elect_dist.isin(ed.elect_dist)][['elect_dist','council_district','assembly_district','senate_district','congressional_district']]
xw_out = xw[['elect_dist','council_district','assembly_district','senate_district','congressional_district']].copy()
xw_out['has_registered_voters'] = xw_out.elect_dist.isin(ed.elect_dist).astype(int)
xw_out.to_csv('out/ed_district_crosswalk.csv', index=False)

def agg(key, label):
    g = ed.dropna(subset=[key]).groupby(key)[cols].sum()
    g.insert(0,'ed_count', ed.dropna(subset=[key]).groupby(key).size())
    for p in P[:-1]: g[f'{p.lower()}_pct'] = (g[f'{p.lower()}_total']/g['total_total']*100).round(2)
    g['inactive_pct'] = (g['total_inactive']/g['total_total']*100).round(2)
    g = g.reset_index().rename(columns={key:'district'}); g.insert(0,'district_type',label)
    return g
aggs = {'council':agg('council_district','City Council'),'assembly':agg('assembly_district','State Assembly'),
        'senate':agg('senate_district','State Senate'),'congressional':agg('congressional_district','Congress'),'borough':agg('borough','Borough')}
for k,g in aggs.items(): g.to_csv(f'out/enrollment_by_{k}.csv', index=False)

db = 'out/nyc_voter_enrollment_feb2026.sqlite'
if os.path.exists(db): os.remove(db)
con = sqlite3.connect(db)
ed.to_sql('election_districts', con, index=False)
L.rename(columns={'ad':'ad_code','ed':'ed_number'}).to_sql('enrollment_long', con, index=False)
xw_out.to_sql('ed_district_crosswalk', con, index=False)
for k,g in aggs.items(): g.to_sql(f'by_{k}', con, index=False)
con.executescript('''
CREATE INDEX ix_ed ON election_districts(elect_dist);
CREATE INDEX ix_cc ON election_districts(council_district);
CREATE INDEX ix_ad ON election_districts(assembly_district);
CREATE INDEX ix_sd ON election_districts(senate_district);
CREATE INDEX ix_cd ON election_districts(congressional_district);
CREATE TABLE metadata(key TEXT, value TEXT);
INSERT INTO metadata VALUES
 ('enrollment_source','NYS Board of Elections, Voter Enrollment by Election District, Party Affiliation and Status'),
 ('enrollment_as_of','2026-02-20'),
 ('boundary_source','Election district polygons: NYC Open Data Election_Districts export (2026-10-21). Council, Assembly, Senate, Congress: NYC Department of City Planning (2020 Census redistricting), pulled 2026-10-22.'),
 ('crosswalk_method','Area overlay of ED polygons on each district layer; every mapped ED falls at least 95% inside a single district of each type'),
 ('unmapped','ED 40047 (Queens, 1 voter) has no boundary in the current DCP layer; counted in borough and assembly totals only'),
 ('party_codes','DEM Democratic, REP Republican, CON Conservative, WOR Working Families, OTH all other parties, BLANK not enrolled in any party');
''')
con.commit()
print(ed.shape, {k:len(g) for k,g in aggs.items()})
print(aggs['borough'][['district','ed_count','total_total','dem_pct','rep_pct','blank_pct']].to_string())
print('citywide', ed.total_total.sum())
for k in ['council','senate','congressional']: print(k, aggs[k].total_total.sum())
