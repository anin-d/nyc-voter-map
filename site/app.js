(async function () {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n == null || !isFinite(n) ? '–' : Math.round(n).toLocaleString('en-US');
const pf = (n, d = 1) => n == null || !isFinite(n) ? '–' : n.toFixed(d) + '%';
const usd = n => n == null || !isFinite(n) ? '–' : '$' + fmt(n);
const money = n => n == null || !isFinite(n) ? '–' : Math.abs(n) >= 1e6 ? '$' + (n / 1e6).toFixed(Math.abs(n) >= 1e7 ? 1 : 2) + 'M' : Math.abs(n) >= 1e4 ? '$' + Math.round(n / 1e3) + 'k' : '$' + fmt(n);
const IN_PREVIEW = !!(window.claude && typeof window.claude.use === 'function');
const NARROW = () => matchMedia('(max-width:860px)').matches;

// ---------- vocabulary: voters ----------
const PARTIES = ['dem','rep','con','wor','oth','blank'];
const PNAME = {dem:'Democrats', rep:'Republicans', con:'Conservatives', wor:'Working Families', oth:'Other parties', blank:'No party'};
const PABBR = {dem:'Dem', rep:'Rep', con:'Cons.', wor:'WFP', oth:'Other', blank:'No party'};
const PCOL = {dem:'#2e5fae', rep:'#cc5446', con:'#e09030', wor:'#9b4a85', oth:'#529c5a', blank:'#9a92ad'};
const STATUS_WORD = ['voters', 'active voters', 'inactive voters'];
const LEVELS = {
  cc:  {name:'City Council District', plural:'City Council districts', short:'Council', abbr:'CC', file:'council',
        caption:'New York City’s 51 City Council districts. Click one to see who lives, votes and governs there.'},
  ad:  {name:'State Assembly District', plural:'State Assembly districts', short:'Assembly', abbr:'AD', file:'assembly',
        caption:'The 65 State Assembly districts in the city.'},
  sd:  {name:'State Senate District', plural:'State Senate districts', short:'Senate', abbr:'SD', file:'senate',
        caption:'The 28 State Senate districts with NYC voters. Two reach into Westchester, and only their NYC part is counted.'},
  cd:  {name:'Congressional District', plural:'Congressional districts', short:'Congress', abbr:'CD', file:'congressional',
        caption:'The 13 Congressional districts with NYC voters. Two reach outside the city, and only their NYC part is counted.'},
  ed:  {name:'Election District', plural:'election districts', short:'ED', abbr:'ED', file:'election_district',
        caption:'4,026 election districts, the smallest area voters are assigned to. Zoom in to read their numbers.'},
  tract:{name:'Census Tract', plural:'census tracts', short:'Tract', abbr:'CT', file:'census_tract',
        caption:'2,327 census tracts, the Census Bureau’s neighborhood-sized areas of about 3,600 residents. Voter counts here are estimated from the election districts that overlap each tract.'},
  boro:{name:'Borough', plural:'boroughs', short:'', abbr:'', file:'borough', caption:'The five boroughs.'},
  zip: {name:'ZIP code area', plural:'ZIP code areas', short:'ZIP', abbr:'ZIP', file:'zip',
        caption:'177 ZIP code areas. Only political donations are counted by ZIP code, because donors list a ZIP, not a street address.'}
};
const ALL_LEVELS = ['cc','ad','sd','cd','ed','tract','boro'];
const METRICS = [
  {k:'dem', label:'Democrats', dot:PCOL.dem}, {k:'rep', label:'Republicans', dot:PCOL.rep},
  {k:'blank', label:'No party', dot:PCOL.blank}, {k:'con', label:'Conservatives', dot:PCOL.con},
  {k:'wor', label:'Working Families', dot:PCOL.wor}, {k:'oth', label:'Other parties', dot:PCOL.oth},
  {k:'margin', label:'Dem vs. Rep gap', ramp:'linear-gradient(90deg,#a8342a,#ece9ef,#2e5fae)'},
  {k:'total', label:'Number of voters', ramp:'linear-gradient(90deg,#c9e4e1,#17504e)'},
  {k:'inactive', label:'Inactive voters', ramp:'linear-gradient(90deg,#f2e2b8,#6b4b13)'}
];
const PAL = {
  dem:['#eef3fb','#cddcf2','#a5c1e8','#79a1db','#4f80c9','#2e5fae','#1b3f80'],
  rep:['#fcefed','#f6d0ca','#eda89e','#e07c6e','#cc5446','#a8342a','#7a1f18'],
  blank:['#f3f1f6','#ddd8e6','#c2b9d2','#a398bb','#8477a2','#655a86','#463f63'],
  con:['#fdf2e6','#f9dbb8','#f3bd83','#ea9b50','#d97a2b','#b45d18','#844210'],
  wor:['#fbeef6','#f2d0e4','#e6aacd','#d47fb2','#bb5694','#953a74','#6a2753'],
  oth:['#eef6ee','#d0e8d0','#a9d4aa','#7cba80','#529c5a','#367c40','#235a2c'],
  total:['#ecf5f4','#c9e4e1','#9ccdc8','#6cb1ab','#43918c','#28706d','#17504e'],
  inactive:['#fbf5e6','#f2e2b8','#e6c983','#d5aa52','#bb8a2f','#94691d','#6b4b13'],
  census:['#fbf7ef','#f1e3c6','#e3c690','#cfa25c','#b07c3a','#875a26','#5c3c18'],
  reg:['#f3eef6','#e0d2ea','#c7aed9','#a786c2','#8562a6','#644585','#462e61'],
  field:['#eef2f7','#d3deeb','#b0c4dc','#87a5c8','#5f86b1','#3f6894','#284a6e'],
  cond:['#fdf1ec','#f9d6c6','#f2b49a','#e78c6b','#d46544','#b0432a','#7f2b18'],
  money:['#eef6f0','#cfe8d6','#a8d4b6','#78b98f','#4c9b6a','#2f7a4d','#1b5734'],
  turnout:['#eef5f6','#cfe5e8','#a7cfd5','#78b3bc','#4b939e','#2d727d','#1b525a'],
  neutral:['#f2f1f4','#dddbe3','#c2bfcc','#a29fb1','#827e95','#625f77','#454359']
};
const MARGIN_BREAKS = [-40,-20,-5,5,20,40,60,80];
const MARGIN_COLS = ['#7a1f18','#cc5446','#eda89e','#ece9ef','#cddcf2','#a5c1e8','#79a1db','#4f80c9','#1b3f80'];
const LINE_KINDS = [
  {k:'cc', label:'Council', style:{color:'#1a1e23', weight:1.6, opacity:.9}, css:'border-top:2px solid'},
  {k:'ad', label:'Assembly', style:{color:'#0b6b66', weight:1.9, dashArray:'6 4', opacity:.95}, css:'border-top:2px dashed'},
  {k:'sd', label:'Senate', style:{color:'#6e3aa3', weight:1.9, dashArray:'2 4', opacity:.95}, css:'border-top:2px dotted'},
  {k:'cd', label:'Congress', style:{color:'#9a5200', weight:3, opacity:.85}, css:'border-top:3px solid'},
  {k:'tract', label:'Census tracts', style:{color:'#5d6670', weight:.9, dashArray:'3 3', opacity:.9}, css:'border-top:1px dashed'},
  {k:'boro', label:'Borough', style:{color:'#1a1e23', weight:2.6, opacity:.9}, css:'border-top:3px solid'}
];
const EXAMPLES = {
  cc:[[[28],'Council 28'],[[33,34,35],'Council 33, 34, 35']], ad:[[[32],'Assembly 32'],[[29,32,33],'Assembly 29, 32, 33']],
  sd:[[[10],'Senate 10'],[[14,10],'Senate 10 and 14']], cd:[[[6],'Congress 6'],[[14,15],'Congress 14 and 15']],
  ed:[[[23001,23002,23003],'EDs 23001 to 23003']], tract:[], boro:[[['Queens','Brooklyn'],'Queens and Brooklyn']],
  zip:[[['10025'],'ZIP 10025'],[['11201','11215'],'ZIPs 11201 and 11215']]
};

// ---------- vocabulary: residents (ACS + CVAP) ----------
const CATS = [
  {k:'key', label:'Key numbers'}, {k:'people', label:'Age and citizenship'}, {k:'race', label:'Race and ethnicity'},
  {k:'origin', label:'Origins'}, {k:'lang', label:'Language and immigration'}, {k:'money', label:'Money and work'},
  {k:'housing', label:'Housing'}, {k:'edu', label:'Education and service'}
];
let CI = [], CIK = {}, RACE = [];
const KEY_SET = ['cvap','reg','hisp','nhblack','nhasian','nhwhite','med_inc','pov','renter','lep_hh','fborn','ba_plus','age65p','moved20'];
const catItems = cat => cat === 'key' ? KEY_SET.map(k => CIK[k]).filter(Boolean) : CI.filter(c => c.cat === cat);

// ---------- vocabulary: homes, conditions, money ----------
const FIELD = [
  {k:'units', label:'Homes', type:'num', desc:'Residential units, apartments and houses, from the city’s tax lot file: the doors a canvass can knock.'},
  {k:'vph', label:'Active voters per 100 homes', type:'ratio', desc:'Active registered voters for every 100 homes. Higher means more voters behind each door.'},
  {k:'p1_2', label:'Homes in 1–2 unit houses', num:'u1_2', desc:'Share of homes in one- and two-family houses.'},
  {k:'p3_9', label:'Homes in 3–9 unit buildings', num:'u3_9', desc:'Share of homes in small buildings, mostly walk-ups and row houses.'},
  {k:'p10_49', label:'Homes in 10–49 unit buildings', num:'u10_49', desc:'Share of homes in mid-size apartment buildings.'},
  {k:'p50', label:'Homes in 50+ unit buildings', num:'u50', desc:'Share of homes in large buildings, which often need lobby access to reach.'},
  {k:'pnycha', label:'Homes in NYCHA public housing', num:'nycha', desc:'Share of homes in New York City Housing Authority developments.'}
];
const FIELDK = Object.fromEntries(FIELD.map(f => [f.k, f]));
const COND = [
  {k:'311_total', g:'311 requests', label:'All 311 requests', per:'pop'},
  {k:'311_noise', g:'311 requests', label:'Noise', per:'pop'},
  {k:'311_heat', g:'311 requests', label:'No heat or hot water', per:'hu'},
  {k:'311_housing', g:'311 requests', label:'Other apartment problems', per:'hu', desc:'Complaints the housing department handles besides heat: leaks, mold, pests, paint, plumbing, doors, elevators and more.'},
  {k:'311_rodent', g:'311 requests', label:'Rodents', per:'pop'},
  {k:'311_trash', g:'311 requests', label:'Trash and dirty streets', per:'pop', desc:'Dirty conditions, illegal dumping, missed collections, litter baskets, graffiti and dead animals.'},
  {k:'311_street', g:'311 requests', label:'Streets, sidewalks and lights', per:'pop'},
  {k:'311_parking', g:'311 requests', label:'Illegal parking and abandoned cars', per:'pop', desc:'Illegal parking, blocked driveways, and abandoned or derelict vehicles.'},
  {k:'311_homeless', g:'311 requests', label:'Homelessness and encampments', per:'pop'},
  {k:'hpd_total', g:'Housing', label:'Housing code violations', per:'hu', desc:'Violations the housing department issued to buildings.'},
  {k:'hpd_c', g:'Housing', label:'Immediately hazardous violations', per:'hu', desc:'Class C violations: conditions the city says must be fixed within 24 hours, like no heat, lead paint, broken locks or vermin.'},
  {k:'evict_evict', g:'Housing', label:'Evictions', per:'hu', desc:'Residential evictions carried out by city marshals.'},
  {k:'nypd_total', g:'Crime', label:'All crime complaints', per:'pop', desc:'Felonies, misdemeanors and violations reported to the NYPD.'},
  {k:'nypd_felony', g:'Crime', label:'Felonies', per:'pop'},
  {k:'nypd_violent', g:'Crime', label:'Violent felonies', per:'pop', desc:'Murder, rape, robbery and felony assault.'},
  {k:'nypd_property', g:'Crime', label:'Property felonies', per:'pop', desc:'Burglary, grand larceny and car theft.'},
  {k:'nypd_misdemeanor', g:'Crime', label:'Misdemeanors', per:'pop'}
];
const CONDK = Object.fromEntries(COND.map(c => [c.k, c]));
const MONEY = [
  {k:'fund', label:'Council discretionary funding', lv:['cc'], type:'usd', desc:'Dollars each Council Member designated to local groups for fiscal year 2027 (July 2026 to June 2027).'},
  {k:'cfb', label:'Given to 2025 city candidates', lv:['zip'], type:'usd', desc:'Contributions from donors in each ZIP code to candidates for Mayor, Public Advocate, Comptroller, Borough President and City Council in 2025, net of refunds.'},
  {k:'cfb_pc', label:'City candidates, dollars per resident', lv:['zip'], type:'usd2', desc:'2025 city race contributions divided by the ZIP area’s residents.'},
  {k:'fec', label:'Given to federal campaigns and committees', lv:['zip'], type:'usd', desc:'Itemized contributions from donors in each ZIP code to federal candidates, parties and PACs in the 2025–2026 cycle.'},
  {k:'fec_pc', label:'Federal, dollars per resident', lv:['zip'], type:'usd2', desc:'Federal contributions divided by the ZIP area’s residents.'},
  {k:'fec_dem', label:'Federal party money: share to Democrats', lv:['zip'], type:'pct', desc:'Of federal money given to a party or a party’s candidates, the share that went to Democrats rather than Republicans.'}
];
const MONEYK = Object.fromEntries(MONEY.map(m => [m.k, m]));

// ---------- data ----------
const lazy = {};
const load = f => lazy[f] || (lazy[f] = fetch('data/' + f).then(r => { if (!r.ok) throw new Error(f); return r.json(); }));
let topo, enroll, hoods, labels, reach, cen, tractTopo, tractLabels, spec, cvapData, REPS, POLLS, DOORS, ELIX;
try {
  [topo, enroll, hoods, labels, reach, cen, tractTopo, tractLabels, spec, cvapData, REPS, POLLS, DOORS, ELIX] = await Promise.all(
    ['nyc.topo.json','enroll.json','hoods.json','labels.json','reach.json','census.json','tracts.topo.json','tract_labels.json','indicators.json','cvap.json',
     'reps.json','polls.json','doors.json','results/elections.json'].map(load));
} catch (err) {
  $('#loading').textContent = 'The map data didn’t load. Check your connection and reload the page.';
  return;
}
labels.tract = tractLabels;
CI = spec.indicators; CIK = Object.fromEntries(CI.map(c => [c.k, c])); RACE = CI.filter(c => c.race);
const EDV = enroll.ed;
const FEAT = {};
for (const k of ['ed','cc','ad','sd','cd','boro']) FEAT[k] = topojson.feature(topo, topo.objects[k]).features;
FEAT.tract = topojson.feature(tractTopo, tractTopo.objects[Object.keys(tractTopo.objects)[0]]).features;
const EDM = {};
for (const f of FEAT.ed) { const p = f.properties; EDM[p.id] = {cc:p.cc, ad:p.ad, sd:p.sd, cd:p.cd, boro:p.boro}; }
if (!EDM[40047] && EDV['40047']) EDM[40047] = {cc:null, ad:40, sd:null, cd:null, boro:'Queens'};
const ZERO = new Array(21).fill(0);
const ED_WITH_VOTERS = Object.keys(EDV).length;

const model = CityCore.init(cen, spec, EDM);
const cvapModel = CityCore.init(cvapData, spec, EDM, {tractOf: a => a.slice(0, 11), popField: 'cvap'});
const F = model.F, TINFO = model.TINFO;
const BOROFIPS = {'005':'Bronx','047':'Brooklyn','061':'Manhattan','081':'Queens','085':'Staten Island'};
const tractBoro = t => BOROFIPS[t.slice(2, 5)];
const tractCode = t => { const c = (TINFO[t] && TINFO[t][1]) || t.slice(5); const n = +c.slice(0, 4), s = c.slice(4); return s === '00' ? String(n) : `${n}.${s}`; };

// voter aggregates
const AGG = {};
for (const lvl of ['ed','cc','ad','sd','cd','boro']) {
  const m = new Map();
  for (const [id, mem] of Object.entries(EDM)) {
    const key = lvl === 'ed' ? +id : mem[lvl];
    if (key == null) continue;
    let u = m.get(key);
    if (!u) { u = {id:key, v:new Array(21).fill(0), eds:[]}; m.set(key, u); }
    const v = EDV[id];
    if (v) { for (let i = 0; i < 21; i++) u.v[i] += v[i]; u.eds.push(+id); }
  }
  AGG[lvl] = m;
}
const TPIECES = new Map();
AGG.tract = new Map(cen.tracts.map(t => [t, {id:t, v:new Array(21).fill(0), eds:[]}]));
for (const [ed, pieces] of Object.entries(cen.xw)) {
  const v = EDV[ed];
  for (const [ti, wp, wh, we] of pieces) {
    const t = cen.tracts[ti], u = AGG.tract.get(t);
    if (v) for (let i = 0; i < 21; i++) u.v[i] += v[i] * we;
    if (!TPIECES.has(t)) TPIECES.set(t, []);
    TPIECES.get(t).push([+ed, wp, we]);
    if (v && we > 0) u.eds.push(+ed);
  }
}
AGG.zip = new Map(Object.keys(labels.zip || {}).map(z => [z, {id:z, v:ZERO, eds:[]}]));
const cenUnit = (lvl, id) => lvl === 'zip' ? null : CityCore.unit(model, lvl, id);
const CITY = new Array(21).fill(0);
for (const v of Object.values(EDV)) for (let i = 0; i < 21; i++) CITY[i] += v[i];

// homes by level: districts are sums of election districts, tracts come straight from each lot's tract
const DF = Object.fromEntries(DOORS.fields.map((f, i) => [f, i]));
const DAGG = {ed:new Map(), tract:new Map(Object.entries(DOORS.tract))};
for (const k of ['cc','ad','sd','cd','boro']) DAGG[k] = new Map();
for (const [ed, a] of Object.entries(DOORS.ed)) {
  DAGG.ed.set(+ed, a);
  const m = EDM[ed]; if (!m) continue;
  for (const k of ['cc','ad','sd','cd','boro']) {
    const key = m[k]; if (key == null) continue;
    let s = DAGG[k].get(key); if (!s) DAGG[k].set(key, s = new Array(a.length).fill(0));
    for (let i = 0; i < a.length; i++) s[i] += a[i];
  }
}
const DCITY = new Array(DOORS.fields.length).fill(0);
for (const a of Object.values(DOORS.ed)) for (let i = 0; i < a.length; i++) DCITY[i] += a[i];
const doorsOf = (lvl, id) => id === '__city' ? DCITY : DAGG[lvl] ? DAGG[lvl].get(id) : null;

// polls
const POLL_ED = POLLS.ed, SITES = POLLS.sites;
const POLL_COUNT = new Map();
for (const [ed, [e]] of Object.entries(POLL_ED)) if (e != null) POLL_COUNT.set(e, (POLL_COUNT.get(e) || 0) + 1);

// conditions (loaded in the background; the map waits only when you pick one)
let CONDS = null, CF = {}, CAGG = null;
async function loadConds() {
  if (CONDS) return CONDS;
  const d = await load('conditions.json');
  CF = Object.fromEntries(d.fields.map((f, i) => [f, i]));
  CAGG = {ed:new Map()};
  for (const k of ['cc','ad','sd','cd','boro']) CAGG[k] = new Map();
  const city = new Array(d.fields.length).fill(0);
  for (const [ed, a] of Object.entries(d.ed)) {
    CAGG.ed.set(+ed, a); for (let i = 0; i < a.length; i++) city[i] += a[i];
    const m = EDM[ed]; if (!m) continue;
    for (const k of ['cc','ad','sd','cd','boro']) {
      const key = m[k]; if (key == null) continue;
      let s = CAGG[k].get(key); if (!s) CAGG[k].set(key, s = new Array(a.length).fill(0));
      for (let i = 0; i < a.length; i++) s[i] += a[i];
    }
  }
  CAGG.city = city;
  return CONDS = d;
}
let FUND = null, DON = null;
const loadFund = async () => FUND || (FUND = await load('funding.json'));
const loadDon = async () => DON || (DON = await load('donations.json'));

const sortIds = lvl => [...AGG[lvl].keys()].sort((a, b) => typeof a === 'number' ? a - b : String(a).localeCompare(String(b)));
const partial = (lvl, id) => { const r = reach[lvl] && reach[lvl][id]; return r && r.nyc_share < 100 ? r : null; };
const unitName = (lvl, id) => lvl === 'boro' ? id : lvl === 'tract' ? `Tract ${tractCode(id)}` : lvl === 'zip' ? `ZIP ${id}` : `${LEVELS[lvl].short} ${id}`;
const unitLong = (lvl, id) => lvl === 'boro' ? id : lvl === 'tract' ? `Census Tract ${tractCode(id)}, ${tractBoro(id)}` : lvl === 'zip' ? `ZIP code area ${id}` : `${LEVELS[lvl].name} ${id}`;

// ---------- numbers ----------
function metricValue(v, metric, st) {
  const o = st * 7, tot = v[o + 6];
  if (metric === 'total') return tot;
  if (metric === 'inactive') return v[6] ? v[20] / v[6] * 100 : null;
  if (!tot) return null;
  if (metric === 'margin') return (v[o] - v[o + 1]) / tot * 100;
  return v[o + PARTIES.indexOf(metric)] / tot * 100;
}
const ev = (ind, ctx) => ind.src === 'cvap' ? CityCore.evaluate(cvapModel, ind, {...ctx, ...(ctx.cvap || {c:null, m:null, split:0})}) : CityCore.evaluate(model, ind, ctx);
const cval = (ind, ctx) => ev(ind, ctx).x;
const REL_TEXT = {medium:'Medium reliability: the margin of error is 15 to 30% of the estimate, or the area is mostly split from larger census tracts.', low:'Low reliability: the margin of error is large compared with the estimate. Treat as a rough sign only.'};
const relBadge = rel => rel === 'medium' || rel === 'low' ? `<span class="rel rel-${rel}" title="${REL_TEXT[rel]}">${rel === 'low' ? 'low reliability' : 'medium'}</span>` : '';
const relSlot = rel => `<span class="relslot">${rel === 'medium' || rel === 'low' ? `<i class="reldot rel-${rel}" title="${REL_TEXT[rel]}"></i><span class="sr">${rel} reliability</span>` : ''}</span>`;
const fmtMoe = (ind, m) => m == null || !isFinite(m) ? '' : ind.type === 'num' ? '±' + fmt(m) : ind.type === 'usd' ? '±' + usd(Math.round(m / 100) * 100) : ind.type === 'reg' ? '±' + m.toFixed(0) : '±' + m.toFixed(1);
const fmtC = (ind, x) => x == null ? 'Too few residents' : ind.type === 'num' ? fmt(x) : ind.type === 'usd' ? (x === 200000 ? '$200,000+' : x >= 250001 ? '$250,000+' : usd(Math.round(x / 100) * 100)) : ind.type === 'reg' ? x.toFixed(0) : pf(x);
const unitCtx = (lvl, id) => { if (lvl === 'zip') return {c:null, m:null, split:0, cvap:null, v:null}; const u = cenUnit(lvl, id), q = CityCore.unit(cvapModel, lvl, id); return {c:u ? u.c : null, m:u ? u.m : null, split:u ? u.split : 0, cvap:q ? {c:q.c, m:q.m, split:q.split} : null, v:AGG[lvl].get(id) ? AGG[lvl].get(id).v : null, tract: lvl === 'tract' ? id : null}; };
const cityCtx = () => ({c:model.city.c, m:model.city.m, split:0, cvap:{c:cvapModel.city.c, m:cvapModel.city.m, split:0}, v:CITY});
const gap = x => x == null ? '–' : Math.abs(x) < .05 ? 'Even' : (x > 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1);
const fmtMetric = (m, x) => x == null ? 'No voters' : m === 'total' ? fmt(x) : m === 'margin' ? gap(x) : pf(x);
const share = (v, st, i) => v[st * 7 + 6] ? v[st * 7 + i] / v[st * 7 + 6] * 100 : null;

function fieldValue(k, lvl, id) {
  const a = doorsOf(lvl, id); if (!a) return null;
  const units = a[DF.units];
  if (k === 'units') return units;
  if (units < 20) return null;
  if (k === 'vph') { const v = id === '__city' ? CITY : AGG[lvl] && AGG[lvl].get(id) ? AGG[lvl].get(id).v : null; return v ? v[13] / units * 100 : null; }
  return a[DF[FIELDK[k].num]] / units * 100;
}
const condDen = (k, lvl, id) => { const a = doorsOf(lvl, id); if (!a) return null; return CONDK[k].per === 'hu' ? a[DF.hu20] : a[DF.pop20]; };
function condCount(k, lvl, id) {
  if (!CAGG) return null;
  const a = id === '__city' ? CAGG.city : CAGG[lvl] ? CAGG[lvl].get(id) : null;
  return a ? a[CF[k]] : null;
}
function condValue(k, lvl, id, mode = state.cmode) {
  const n = condCount(k, lvl, id); if (n == null) return null;
  if (mode === 'count') return n;
  const den = condDen(k, lvl, id);
  const min = CONDK[k].per === 'hu' ? 100 : 200;
  return den >= min ? n / den * 1000 : null;
}
function moneyValue(k, lvl, id) {
  if (k === 'fund') { if (lvl !== 'cc' || !FUND) return null; const f = FUND.cc[String(id)]; return f ? f.total : 0; }
  if (lvl !== 'zip' || !DON) return null;
  const a = DON.areas[id] || {}, pop = +DON.pop[id] || 0;
  if (k === 'cfb') return a.cfb ? a.cfb.total : 0;
  if (k === 'fec') return a.fec ? a.fec.total : 0;
  if (k === 'cfb_pc') return pop >= 500 ? (a.cfb ? a.cfb.total : 0) / pop : null;
  if (k === 'fec_pc') return pop >= 500 ? (a.fec ? a.fec.total : 0) / pop : null;
  if (k === 'fec_dem') { const b = a.fec && a.fec.by_party || {}; const d = b.Democratic || 0, r = b.Republican || 0; return d + r >= 1000 ? d / (d + r) * 100 : null; }
  return null;
}

// ---------- elections ----------
const ELX = ELIX.elections, ELBY = Object.fromEntries(ELX.map(e => [e.id, e]));
const ELSHORT = {'2026-primary':'June 2026 primary', '2025-general':'Nov 2025 general', '2025-primary':'June 2025 primary', '2024-general':'Nov 2024 general'};
const LIDX = {cc:0, ad:1, sd:2, cd:3, boro:4};
const RES = {}, RESF = {};
const PARTY_COL = {Democratic:'#2e5fae', Republican:'#cc5446', 'Working Families':'#9b4a85', Conservative:'#e09030'};
const CAT = ['#e08a1e','#1b9e8a','#8d6cab','#6b8e23','#d1495b','#2e6fbd','#5d6d7e','#b5651d','#17becf','#c2185b','#7cb342','#a0522d'];
const rgbDist = (a, b) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const TIE = '#8a8f96';
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const partyOfLine = l => { const m = /\(([^()]+)\)\s*$/.exec(l || ''); return m ? m[1] : null; };
const shortName = n => {
  if (/^(yes|no)$/i.test(n)) return n;
  const first = n.split(' / ')[0].replace(/,?\s+(Jr|Sr|II|III|IV)\.?$/i, '').trim().split(/\s+/);
  return first[first.length - 1];
};
async function loadElection(eid) {
  if (RES[eid]) return RES[eid];
  const E = await load(`results/${eid}.json`);
  E.byId = new Map(E.contests.map(c => [c.id, c]));
  const g = new Map();
  for (const c of E.contests) if (['cc','ad','sd','cd','boro'].includes(c.scope[0])) { const key = [c.party, c.office, c.scope[0]].join('|'); if (!g.has(key)) g.set(key, []); g.get(key).push(c); }
  E.groups = [];
  for (const [key, list] of g) {
    if (list.length < 2) continue;
    const [party, office, st] = key.split('|');
    const grp = {id:'all-' + slug(key), group:true, party, office, scope:[st, null], members:list, vote_for:1,
      title:`${party ? party + ' Primary: ' : ''}${office}, all ${list.length} races`, byScope:new Map(list.map(c => [String(c.scope[1]), c]))};
    E.groups.push(grp); E.byId.set(grp.id, grp);
  }
  E.unitEds = {};
  for (const k of ['cc','ad','sd','cd','boro']) { const m = new Map(); for (const mem of Object.values(E.eds)) { const key = mem[LIDX[k]]; if (key != null) m.set(key, (m.get(key) || 0) + 1); } E.unitEds[k] = m; }
  RES[eid] = E;
  return E;
}
async function loadVintageFeat(eid) {
  if (RESF[eid]) return RESF[eid];
  const t = await load(`results/${eid}.topo.json`);
  return RESF[eid] = topojson.feature(t, t.objects[Object.keys(t.objects)[0]]).features;
}
function prep(c) {
  if (c._p) return c._p;
  const li = new Map(c.lines.map((l, i) => [l, i + 1]));
  const usedParty = new Set(), used = []; let k = 0;
  // party candidates first, so other candidates can avoid colors that look like a party in this race
  const party0 = c.candidates.map(cd => c.party ? null : partyOfLine(cd.lines[0]));
  c.candidates.forEach((cd, i) => { const pt = party0[i]; if (pt && PARTY_COL[pt] && !usedParty.has(pt)) { usedParty.add(pt); used.push(PARTY_COL[pt]); } });
  const taken = new Set();
  const cands = c.candidates.map((cd, i) => {
    const party = party0[i];
    let color;
    if (/^yes$/i.test(cd.name)) color = '#1b9e8a';
    else if (/^no$/i.test(cd.name)) color = '#b5651d';
    else if (party && PARTY_COL[party] && !taken.has(party)) { color = PARTY_COL[party]; taken.add(party); }
    else {
      let tries = 0;
      while (tries++ < CAT.length && used.some(u => rgbDist(u, CAT[k % CAT.length]) < 90)) k++;
      color = CAT[k++ % CAT.length]; used.push(color);
    }
    return {name:cd.name, short:shortName(cd.name), idx:cd.lines.map(l => li.get(l)).filter(Boolean), party, color, votes:cd.votes};
  });
  return c._p = {cands, proposal:cands.some(x => /^yes$/i.test(x.name))};
}
function aggContest(E, c, lvl) {
  c._agg = c._agg || {};
  if (c._agg[lvl]) return c._agg[lvl];
  const p = prep(c), n = p.cands.length, out = new Map();
  const li = LIDX[lvl];
  for (const [ed, r] of Object.entries(c.rows)) {
    const key = lvl === 'ed' ? +ed : (E.eds[ed] || [])[li];
    if (key == null) continue;
    let a = out.get(key); if (!a) out.set(key, a = {b:0, cv:new Float64Array(n), tot:0, ne:0});
    a.b += r[0]; a.ne++;
    for (let i = 0; i < n; i++) { let s = 0; for (const j of p.cands[i].idx) s += r[j]; a.cv[i] += s; }
    for (let j = 1; j < r.length; j++) a.tot += r[j];
  }
  if (lvl === 'ed') for (const [m, h] of Object.entries(E.combined)) if (out.has(h)) out.set(+m, Object.assign({}, out.get(h), {host:h}));
  return c._agg[lvl] = out;
}
function aggFinal(E, c, lvl) {
  if (!c.rcv) return null;
  c._fin = c._fin || {};
  if (c._fin[lvl]) return c._fin[lvl];
  const out = new Map(), li = LIDX[lvl];
  for (const [ed, r] of Object.entries(c.rcv.rows)) {
    const key = lvl === 'ed' ? +ed : (E.eds[ed] || [])[li];
    if (key == null) continue;
    let a = out.get(key); if (!a) out.set(key, a = {b:0, inact:0, f:[0, 0]});
    a.b += r[0]; a.inact += r[1]; a.f[0] += r[2]; a.f[1] += r[3];
  }
  if (lvl === 'ed') for (const [m, h] of Object.entries(E.combined)) if (out.has(h)) out.set(+m, Object.assign({}, out.get(h), {host:h}));
  return c._fin[lvl] = out;
}
// a general election's district races added up by party, for views above the district level
function partyAgg(E, g, lvl) {
  g._pa = g._pa || {};
  if (g._pa[lvl]) return g._pa[lvl];
  const out = new Map(), li = LIDX[lvl];
  for (const c of g.members) {
    const p = prep(c);
    for (const [ed, r] of Object.entries(c.rows)) {
      const key = lvl === 'ed' ? +ed : (E.eds[ed] || [])[li];
      if (key == null) continue;
      let a = out.get(key); if (!a) out.set(key, a = {b:0, pv:{}, tot:0});
      a.b += r[0];
      for (const cd of p.cands) { let s = 0; for (const j of cd.idx) s += r[j]; const pt = cd.party || 'Other'; a.pv[pt] = (a.pv[pt] || 0) + s; }
      for (let j = 1; j < r.length; j++) a.tot += r[j];
    }
  }
  return g._pa[lvl] = out;
}
const resOn = () => state.metric === 'r' && RES[state.res.e] && RES[state.res.e].byId.get(state.res.c);
const curE = () => RES[state.res.e];
const curC = () => { const E = curE(); return E ? E.byId.get(state.res.c) : null; };
const useFinal = c => state.res.round === 'final' && c && c.rcv;
function resLevels(c) { return ['ed','cc','ad','sd','cd','boro']; }
function resAvailable(c, lvl) {
  if (!c || lvl === 'tract' || lvl === 'zip') return false;
  if (c.group && c.party && lvl !== 'ed' && lvl !== c.scope[0]) return false;   // primaries: each district has different candidates
  return true;
}
// one unit's result: {b, items:[{name, short, color, votes}], tot, partialCover, host, final}
function unitRes(lvl, id) {
  const E = curE(), c = curC(); if (!E || !c || !resAvailable(c, lvl)) return null;
  if (c.group) {
    const st = c.scope[0];
    let sid = lvl === st ? id : lvl === 'ed' ? (E.eds[String(id)] || [])[LIDX[st]] : null;
    if (sid != null) {
      const m = c.byScope.get(String(sid)); if (!m) return null;
      const r = single(E, m, lvl, id); if (r) r.contest = m; return r;
    }
    const a = partyAgg(E, c, lvl).get(id); if (!a) return null;
    const items = Object.entries(a.pv).map(([pt, v]) => ({name:pt, short:pt, color:PARTY_COL[pt] || TIE, votes:v})).sort((x, y) => y.votes - x.votes);
    return {b:a.b, items, tot:a.tot, byParty:true};
  }
  return single(E, c, lvl, id);
}
function single(E, c, lvl, id) {
  const p = prep(c);
  if (useFinal(c)) {
    const a = aggFinal(E, c, lvl).get(id); if (!a) return null;
    const items = c.rcv.finalists.map((nm, i) => { const cd = p.cands.find(x => x.name === nm) || {color:CAT[i], short:shortName(nm)}; return {name:nm, short:cd.short, color:cd.color, votes:a.f[i]}; }).sort((x, y) => y.votes - x.votes);
    return {b:a.b, items, tot:a.f[0] + a.f[1], inact:a.inact, host:a.host, final:true};
  }
  const a = aggContest(E, c, lvl).get(id); if (!a) return null;
  const items = p.cands.map((cd, i) => ({name:cd.name, short:cd.short, color:cd.color, votes:a.cv[i]})).sort((x, y) => y.votes - x.votes);
  const cover = lvl !== 'ed' && E.unitEds[lvl] ? a.ne / (E.unitEds[lvl].get(id) || a.ne) : 1;
  return {b:a.b, items, tot:a.tot, host:a.host, partialCover: c.scope[0] !== 'city' && lvl !== c.scope[0] && lvl !== 'ed' && cover < .999};
}
const PIDX = {Democratic:0, Republican:1, Conservative:2, 'Working Families':3};
function turnoutOK(c, lvl) {
  const E = curE(); if (!E || !c) return false;
  if (E.id !== '2026-primary' && E.id !== '2025-general') return false;
  if (E.id === '2025-general' && lvl === 'ed') return false;
  if (useFinal(c)) return false;
  return c.group || c.scope[0] === 'city' || lvl === 'ed' || lvl === c.scope[0];
}
function turnoutOf(c, lvl, id, r) {
  if (!r || !turnoutOK(c, lvl)) return null;
  const E = curE();
  const pi = c.party ? PIDX[c.party] : 6;
  if (pi == null) return null;
  let den = 0;
  if (lvl === 'ed') {
    const host = r.host || id;
    const ids = [host, ...Object.entries(E.combined).filter(([, h]) => h === host).map(([m]) => +m)];
    for (const e of ids) { const v = EDV[e]; if (v) den += v[pi]; }
  } else { const u = AGG[lvl].get(id); if (!u) return null; den = u.v[pi]; }
  return den >= 20 ? r.b / den * 100 : null;
}
function resValue(lvl, id) {
  const r = unitRes(lvl, id); if (!r || !r.tot && state.res.v !== 'ballots') return null;
  const v = state.res.v, find = nm => { const it = r.items.find(x => x.name === nm); return it ? it.votes : 0; };
  if (v === 'ballots') return r.b;
  if (v === 'turnout') return turnoutOf(curC(), lvl, id, r);
  if (v === 'share') return find(state.res.a) / r.tot * 100;
  if (v === 'h2h') return (find(state.res.a) - find(state.res.b)) / r.tot * 100;
  if (v === 'winm') return r.items.length > 1 ? (r.items[0].votes - r.items[1].votes) / r.tot * 100 : 100;
  if (v === 'exhausted') return r.final && r.b ? r.inact / r.b * 100 : null;
  return null;
}
const mix = (hex, t, base) => {
  const b = base || (isDark() ? '#1a1e22' : '#ffffff');
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(hex), [r2, g2, b2] = p(b);
  return '#' + [r1 * t + r2 * (1 - t), g1 * t + g2 * (1 - t), b1 * t + b2 * (1 - t)].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
};
const LEAD_BINS = [10, 30];
function leadColor(lvl, id) {
  const r = unitRes(lvl, id); if (!r || !r.tot) return null;
  const [a, b] = r.items; if (!a || !a.votes) return null;
  if (b && a.votes === b.votes) return TIE;
  const m = b ? (a.votes - b.votes) / r.tot * 100 : 100;
  return mix(a.color, m < LEAD_BINS[0] ? .42 : m < LEAD_BINS[1] ? .7 : 1);
}
function viewsFor(c) {
  if (!c) return [];
  const p = c.group ? null : prep(c);
  if (c.group) return c.party ? [['winm','Winning margin'], ['ballots','Ballots'], ['turnout','Turnout']] : [['lead','Who won'], ['share','Party share'], ['winm','Winning margin'], ['ballots','Ballots'], ['turnout','Turnout']];
  if (p.proposal) return [['lead','Yes or no'], ['share','Yes share'], ['ballots','Ballots']];
  const v = [['lead','Who led'], ['share','One candidate']];
  if (p.cands.length > 1) v.push(['h2h','Head to head']);
  v.push(['ballots','Ballots'], ['turnout','Turnout']);
  if (c.rcv) v.push(['exhausted','Exhausted ballots']);
  return v;
}
function candOptions(c) {
  if (!c) return [];
  if (c.group) { const s = new Set(); for (const m of c.members) for (const cd of prep(m).cands) s.add(cd.party || 'Other'); return [...s].map(x => [x, x]); }
  if (useFinal(c)) return c.rcv.finalists.map(n => [n, n]);
  return prep(c).cands.map(cd => [cd.name, cd.name]);
}

// ---------- state + shareable links ----------
const state = {level:'cc', metric:'dem', status:0, cat:'key', fade:true, lines:new Set(['boro']), polls:new Set(),
  sel:{ed:[],cc:[],ad:[],sd:[],cd:[],boro:[],tract:[],zip:[]}, addr:null, cmode:'rate', tab:'voters',
  res:{e:'2025-general', c:null, v:'lead', a:null, b:null, round:'1'}};
const STATUS_KEYS = ['all','active','inactive'];
const famOf = m => m === 'r' ? 'elections' : m.startsWith('c:') ? 'residents' : m.startsWith('f:') ? 'field' : m.startsWith('k:') ? 'conditions' : m.startsWith('m:') ? 'money' : 'voters';
const validMetric = m => METRICS.some(x => x.k === m) || (m.startsWith('c:') && CIK[m.slice(2)]) || (m.startsWith('f:') && FIELDK[m.slice(2)]) || (m.startsWith('k:') && CONDK[m.slice(2)]) || (m.startsWith('m:') && MONEYK[m.slice(2)]) || m === 'r';
const isCensus = m => m.startsWith('c:');
const cKey = m => m.slice(2);
function levelsFor(m) {
  const f = famOf(m);
  if (f === 'money') return MONEYK[m.slice(2)].lv;
  if (f === 'conditions' || f === 'elections') return ['cc','ad','sd','cd','ed','boro'];
  return ALL_LEVELS;
}
(function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (LEVELS[h.get('view')]) state.level = h.get('view');
  if (h.get('color') && validMetric(h.get('color'))) state.metric = h.get('color');
  if (isCensus(state.metric)) state.cat = KEY_SET.includes(cKey(state.metric)) ? 'key' : CIK[cKey(state.metric)].cat;
  const s = STATUS_KEYS.indexOf(h.get('voters')); if (s >= 0) state.status = s;
  if (h.has('lines')) state.lines = new Set(h.get('lines').split(',').filter(k => LINE_KINDS.some(l => l.k === k)));
  if (h.has('polls')) state.polls = new Set(h.get('polls').split(',').filter(k => k === 'eday' || k === 'early'));
  if (h.get('rate') === 'count') state.cmode = 'count';
  if (h.get('e') && ELBY[h.get('e')]) state.res.e = h.get('e');
  if (h.get('race')) state.res.c = h.get('race');
  if (h.get('show')) state.res.v = h.get('show');
  if (h.get('a')) state.res.a = h.get('a');
  if (h.get('b')) state.res.b = h.get('b');
  if (h.get('round') === 'final') state.res.round = 'final';
  if (h.get('pick')) state.sel[state.level] = h.get('pick').split(',').map(x => ['boro','tract','zip'].includes(state.level) ? decodeURIComponent(x) : +x).slice(0, 300);
  state.tab = famOf(state.metric);
})();
function writeHash() {
  const p = new URLSearchParams();
  p.set('view', state.level); p.set('color', state.metric);
  if (famOf(state.metric) === 'voters') p.set('voters', STATUS_KEYS[state.status]);
  if (state.metric === 'r') {
    p.set('e', state.res.e); if (state.res.c) p.set('race', state.res.c); p.set('show', state.res.v);
    if (state.res.a && ['share','h2h'].includes(state.res.v)) p.set('a', state.res.a);
    if (state.res.b && state.res.v === 'h2h') p.set('b', state.res.b);
    if (state.res.round === 'final') p.set('round', 'final');
  }
  if (famOf(state.metric) === 'conditions' && state.cmode === 'count') p.set('rate', 'count');
  p.set('lines', [...state.lines].join(','));
  if (state.polls.size) p.set('polls', [...state.polls].join(','));
  if (state.sel[state.level].length) p.set('pick', state.sel[state.level].join(','));
  try { history.replaceState(null, '', '#' + p.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')); } catch (e) {}
}

// ---------- what the map shows ----------
const available = () => levelsFor(state.metric).includes(state.level) && (state.metric !== 'r' || resAvailable(curC(), state.level));
function mapValue(lvl, id) {
  const m = state.metric, f = famOf(m);
  if (!available()) return null;
  if (f === 'residents') return lvl === 'zip' ? null : cval(CIK[cKey(m)], unitCtx(lvl, id));
  if (f === 'field') return fieldValue(m.slice(2), lvl, id);
  if (f === 'conditions') return condValue(m.slice(2), lvl, id);
  if (f === 'money') return moneyValue(m.slice(2), lvl, id);
  if (f === 'elections') return state.res.v === 'lead' ? null : resValue(lvl, id);
  const u = AGG[lvl].get(id); return u ? metricValue(u.v, m, state.status) : null;
}
function mapRel(lvl, id) { return isCensus(state.metric) && lvl !== 'zip' ? ev(CIK[cKey(state.metric)], unitCtx(lvl, id)).rel : ''; }
function fmtValue(x, short) {
  const m = state.metric, f = famOf(m);
  if (x == null) return '–';
  if (f === 'residents') { const ind = CIK[cKey(m)]; return short ? (ind.type === 'num' ? fmt(x) : ind.type === 'usd' ? '$' + fmt(Math.round(x / 1000)) + 'k' : ind.type === 'reg' ? x.toFixed(0) : x.toFixed(1) + '%') : fmtC(ind, x); }
  if (f === 'field') { const k = m.slice(2); return k === 'units' ? fmt(x) : k === 'vph' ? x.toFixed(0) : x.toFixed(1) + '%'; }
  if (f === 'conditions') return state.cmode === 'count' ? fmt(x) : x >= 100 ? fmt(x) : x.toFixed(1);
  if (f === 'money') { const t = MONEYK[m.slice(2)].type; return t === 'pct' ? x.toFixed(1) + '%' : t === 'usd2' ? '$' + x.toFixed(2) : money(x); }
  if (f === 'elections') { const v = state.res.v; return v === 'ballots' ? fmt(x) : v === 'h2h' ? h2hText(x) : x.toFixed(1) + (v === 'winm' ? ' pts' : '%'); }
  if (m === 'total') return fmt(x);
  if (m === 'margin') return x === 0 ? '0' : gap(x);
  return x.toFixed(1) + '%';
}
const h2hText = x => { const c = curC(); const a = state.res.a, b = state.res.b; if (x == null) return '–'; if (Math.abs(x) < .05) return 'Even'; return `${shortName(x > 0 ? a : b)} +${Math.abs(x).toFixed(1)}`; };
function metricTitle(m) {
  const f = famOf(m);
  if (f === 'residents') { const i = CIK[cKey(m)]; return i.type || !i.den ? i.label : `${i.label}, share ${i.unit || 'of residents'}`; }
  if (f === 'field') return FIELDK[m.slice(2)].label;
  if (f === 'conditions') { const c = CONDK[m.slice(2)]; return state.cmode === 'count' ? `${c.label}, count` : `${c.label}, per 1,000 ${c.per === 'hu' ? 'homes' : 'residents'}`; }
  if (f === 'money') return MONEYK[m.slice(2)].label;
  if (f === 'elections') {
    const c = curC(); if (!c) return 'Election results';
    const v = state.res.v, lab = {lead: c.group && !c.party ? 'Winning party' : 'Who led', share: c.group ? `${state.res.a} share` : `${shortName(state.res.a || '')} share`, h2h: `${shortName(state.res.a || '')} vs. ${shortName(state.res.b || '')}`, winm:'Winning margin', ballots:'Ballots cast', turnout:'Turnout', exhausted:'Exhausted ballots'}[v];
    return `${lab}: ${c.title}`;
  }
  return m === 'total' ? 'Number of registered voters' : m === 'inactive' ? 'Inactive voters, share of all voters' : m === 'margin' ? 'Democrats minus Republicans' : `${PNAME[m]}, share of voters`;
}

// ---------- color scale ----------
let breaks = [], cols = [], diverging = false;
function seqFrom(hex) { return [.1, .22, .36, .52, .68, .84, 1].map(t => mix(hex, t, '#ffffff')); }
function computeScale() {
  diverging = false;
  const m = state.metric, f = famOf(m);
  if (m === 'margin') { breaks = MARGIN_BREAKS; cols = MARGIN_COLS; return; }
  if (f === 'elections' && state.res.v === 'lead') { breaks = []; cols = []; return; }
  if (f === 'elections' && state.res.v === 'h2h') {
    const c = curC(), ca = colorOfCand(c, state.res.a), cb = colorOfCand(c, state.res.b);
    breaks = [-40, -20, -10, -2, 2, 10, 20, 40];
    cols = [mix(cb, 1, '#ffffff'), mix(cb, .75, '#ffffff'), mix(cb, .5, '#ffffff'), mix(cb, .25, '#ffffff'), '#efedf1', mix(ca, .25, '#ffffff'), mix(ca, .5, '#ffffff'), mix(ca, .75, '#ffffff'), mix(ca, 1, '#ffffff')];
    diverging = true; return;
  }
  cols = f === 'residents' ? (cKey(m) === 'reg' ? PAL.reg : PAL.census) : f === 'field' ? PAL.field : f === 'conditions' ? PAL.cond : f === 'money' ? PAL.money
    : f === 'elections' ? (state.res.v === 'share' ? seqFrom(colorOfCand(curC(), state.res.a)) : state.res.v === 'turnout' ? PAL.turnout : PAL.neutral) : PAL[m];
  const vals = fillIds().map(id => mapValue(state.level, id)).filter(x => x != null && isFinite(x) && (m !== 'total' || x > 0)).sort((a, b) => a - b);
  const n = cols.length; breaks = [];
  const ind = isCensus(m) ? CIK[cKey(m)] : null;
  const nearZero = vals.filter(x => x < .5).length;
  if (ind && !ind.type && nearZero >= vals.length * .2 && vals.length - nearZero >= n) {
    const rest = vals.filter(x => x >= .5); breaks.push(.5);
    for (let i = 1; i < n - 1; i++) breaks.push(rest[Math.min(rest.length - 1, Math.floor(rest.length * i / (n - 1)))]);
  } else {
    for (let i = 1; i < n; i++) breaks.push(vals[Math.min(vals.length - 1, Math.floor(vals.length * i / n))]);
  }
  breaks = breaks.filter((b, i) => b != null && (i === 0 || b > breaks[i - 1]));
  if (breaks.length < n - 1) cols = cols.slice(n - 1 - breaks.length);
}
function colorOfCand(c, name) {
  if (!c) return TIE;
  if (c.group) return PARTY_COL[name] || TIE;
  const cd = prep(c).cands.find(x => x.name === name); return cd ? cd.color : TIE;
}
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function colorFor(x) {
  if (x == null || (state.metric === 'total' && x === 0)) return css('--nodata');
  let i = 0; while (i < breaks.length && x >= breaks[i]) i++;
  return cols[i];
}
function colorOf(lvl, id) {
  if (state.metric === 'r' && state.res.v === 'lead') return (available() && leadColor(lvl, id)) || css('--nodata');
  return colorFor(mapValue(lvl, id));
}
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };

// ---------- map ----------
const NYC = [[40.4961, -74.2556], [40.9155, -73.7000]];
const map = L.map('map', {preferCanvas:true, zoomSnap:1, zoomDelta:1, minZoom:9, maxZoom:18, boxZoom:false}).fitBounds(NYC, {padding:[12, 12]});
map.attributionControl.setPrefix(false);
map.createPane('ov').style.zIndex = 420;
map.createPane('tilelabels').style.zIndex = 600;
map.createPane('pts').style.zIndex = 640;
map.createPane('lbl').style.zIndex = 650;
for (const p of ['ov','tilelabels','lbl']) map.getPane(p).style.pointerEvents = 'none';
const renderer = L.canvas({padding:.4, tolerance:3});
const ovRenderer = L.canvas({padding:.4, pane:'ov'});
const ptsRenderer = L.canvas({padding:.4, pane:'pts', tolerance:4});

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/{style}/MapServer/tile/{z}/{y}/{x}';
const tileOpts = {maxNativeZoom:16, maxZoom:18};
let baseTiles, labelTiles, tileFails = 0, tileOk = 0, hoodFallback = false;
function setTiles() {
  if (baseTiles) map.removeLayer(baseTiles);
  if (labelTiles) map.removeLayer(labelTiles);
  const d = isDark();
  baseTiles = L.tileLayer(ESRI, Object.assign({style: d ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base',
    attribution:'Basemap: Esri, HERE, Garmin, © OpenStreetMap contributors · Data: NYS and NYC Boards of Elections, U.S. Census Bureau, NYC Open Data, NYC Planning, NYC CFB, FEC'}, tileOpts)).addTo(map);
  labelTiles = L.tileLayer(ESRI, Object.assign({style: d ? 'World_Dark_Gray_Reference' : 'World_Light_Gray_Reference', pane:'tilelabels'}, tileOpts)).addTo(map);
  for (const t of [baseTiles, labelTiles]) {
    t.on('tileload', () => { tileOk++; });
    t.on('tileerror', () => { if (++tileFails > 6 && tileOk === 0 && !hoodFallback) { hoodFallback = true; renderLabels(); } });
  }
}
setTiles();

// the vintage election district map: an older election viewed by election district
const vintageMode = () => state.level === 'ed' && state.metric === 'r' && curE() && !curE().same_lines_as_map && RESF[state.res.e];
const fillFeatures = () => vintageMode() ? RESF[state.res.e] : FEAT[state.level];
const featId = f => state.level === 'ed' ? f.properties.id : state.level === 'tract' ? f.properties.GEOID : state.level === 'zip' ? f.properties.modzcta : f.properties[state.level];
const fillIds = () => vintageMode() ? RESF[state.res.e].map(f => f.properties.id) : [...AGG[state.level].keys()];
let fillLayer = null; const layerById = new Map(); let hoverId = null;
function baseStyle(f) {
  const id = featId(f), lvl = state.level, vm = vintageMode();
  const selected = !vm && state.sel[lvl].includes(id), fine = lvl === 'ed' || lvl === 'tract';
  const faded = state.fade && isCensus(state.metric) && mapRel(lvl, id) === 'low' && mapValue(lvl, id) != null;
  return {renderer, fillColor:(vm || AGG[lvl].has(id)) ? colorOf(lvl, id) : css('--nodata'), fillOpacity: faded ? .22 : .74,
    color: selected ? css('--sel') : (isDark() ? 'rgba(20,24,28,.6)' : 'rgba(255,255,255,.8)'),
    weight: selected ? 3.2 : (fine ? .4 : 1.1), opacity:1};
}
function buildFill() {
  if (fillLayer) map.removeLayer(fillLayer);
  layerById.clear(); computeScale();
  const vm = vintageMode();
  fillLayer = L.geoJSON({type:'FeatureCollection', features:fillFeatures()}, {
    style: baseStyle,
    onEachFeature: (f, layer) => {
      const id = featId(f);
      layerById.set(id, layer);
      layer.on('mouseover', () => { hoverId = id; layer.setStyle({weight:2.6, color:css('--sel')}); showHover(id); });
      layer.on('mouseout', () => { if (hoverId === id) hoverId = null; layer.setStyle(baseStyle(f)); showHover(null); });
      layer.on('click', e => {
        if (e.originalEvent.shiftKey) return;
        if (vm) { L.popup({maxWidth:290, className:'respop'}).setLatLng(e.latlng).setContent(`<div class="pop">${hoverBody(id, true)}</div>`).openOn(map); return; }
        toggleSel(id, true);
      });
    }
  }).addTo(map);
  bringSelToFront(); renderLegend(); renderLabels(); renderAvail();
}
function restyle() { if (!fillLayer) return; computeScale(); fillLayer.eachLayer(l => l.setStyle(baseStyle(l.feature))); bringSelToFront(); renderLegend(); renderAvail(); }
function bringSelToFront() { for (const id of state.sel[state.level]) { const l = layerById.get(id); if (l) l.bringToFront(); } }

// boundary lines
const lineLayers = {};
const labelLayer = L.layerGroup().addTo(map);
function setLine(k, on) {
  const kind = LINE_KINDS.find(l => l.k === k);
  if (on && !lineLayers[k]) {
    lineLayers[k] = L.geoJSON({type:'FeatureCollection', features:FEAT[k]}, {
      style: () => Object.assign({fill:false, interactive:false, renderer:ovRenderer, pane:'ov'}, kind.style), interactive:false}).addTo(map);
  } else if (!on && lineLayers[k]) { map.removeLayer(lineLayers[k]); delete lineLayers[k]; }
}
// poll sites
const pollLayers = {};
const POLL_STYLE = {eday:{radius:5, color:'#ffffff', weight:1.5, fillColor:'#1a1e23', fillOpacity:1}, early:{radius:6.5, color:'#14625f', weight:2.5, fillColor:'#ffffff', fillOpacity:.95}};
function setPolls(kind, on) {
  if (on && !pollLayers[kind]) {
    const used = new Map();
    for (const [ed, pair] of Object.entries(POLL_ED)) { const s = pair[kind === 'eday' ? 0 : 1]; if (s == null) continue; if (!used.has(s)) used.set(s, []); used.get(s).push(+ed); }
    const g = L.layerGroup();
    for (const [s, eds] of used) {
      const [name, addr, boro, lat, lon, approx] = SITES[s];
      const mk = L.circleMarker([lat, lon], Object.assign({renderer:ptsRenderer, pane:'pts'}, POLL_STYLE[kind]));
      mk.bindPopup(() => `<div class="pop"><div class="pop-k">${kind === 'eday' ? 'Election Day poll site' : 'Early voting site'}</div><div class="pop-t">${esc(name)}</div><div>${esc(addr)}, ${esc(boro)}</div>
        <div class="caption">${kind === 'eday' ? `Election Day, Tuesday November 3, ${esc(POLLS.eday_hours)}. ` : 'Early voting, October 24 to November 1. '}Serves ${eds.length} election district${eds.length === 1 ? '' : 's'}${eds.length <= 12 ? ': ' + eds.join(', ') : ''}.</div>
        ${approx ? '<div class="caption">Map point is approximate (within about a block).</div>' : ''}
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr + ', ' + boro + ', NY')}" target="_blank" rel="noopener">Directions</a></div>`, {maxWidth:280});
      g.addLayer(mk);
    }
    pollLayers[kind] = g.addTo(map);
  } else if (!on && pollLayers[kind]) { map.removeLayer(pollLayers[kind]); delete pollLayers[kind]; }
}
function renderLineToggles() {
  $('#lineToggles').innerHTML = LINE_KINDS.map(l =>
    `<button type="button" class="tog" data-k="${l.k}" aria-pressed="${state.lines.has(l.k)}"><span class="ln" style="${l.css};color:${l.style.color === '#1a1e23' ? 'var(--fg)' : l.style.color}"></span>${l.label}</button>`).join('')
    + `<button type="button" class="tog" data-p="eday" aria-pressed="${state.polls.has('eday')}"><span class="pt pt-eday"></span>Election Day poll sites</button>`
    + `<button type="button" class="tog" data-p="early" aria-pressed="${state.polls.has('early')}"><span class="pt pt-early"></span>Early voting sites</button>`;
  $$('#lineToggles .tog[data-k]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k; state.lines.has(k) ? state.lines.delete(k) : state.lines.add(k);
    b.setAttribute('aria-pressed', state.lines.has(k)); setLine(k, state.lines.has(k)); renderLabels(); writeHash();
  }));
  $$('#lineToggles .tog[data-p]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.p; state.polls.has(k) ? state.polls.delete(k) : state.polls.add(k);
    b.setAttribute('aria-pressed', state.polls.has(k)); setPolls(k, state.polls.has(k)); writeHash();
    if (state.polls.has(k) && map.getZoom() < 12) toast('Zoom in to tell the poll sites apart.');
  }));
}

// labels
function addLbl(lat, lng, html, cls) {
  labelLayer.addLayer(L.marker([lat, lng], {pane:'lbl', interactive:false, keyboard:false, icon:L.divIcon({className:'', html:`<div class="lbl ${cls}">${html}</div>`, iconSize:[0, 0]})}));
}
function renderLabels() {
  labelLayer.clearLayers();
  const z = map.getZoom(), b = map.getBounds().pad(.1), lvl = state.level;
  const selSet = new Set(state.sel[lvl].map(String));
  const kinds = new Set([...state.lines].filter(k => !['boro','tract'].includes(k) && k !== lvl));
  const prefix = kinds.size > 0 || lvl === 'ed';
  for (const k of kinds) for (const [id, [lat, lng]] of Object.entries(labels[k])) if (b.contains([lat, lng])) addLbl(lat, lng, `${LEVELS[k].abbr} ${id}`, 'k-' + k);
  if (['cc','ad','sd','cd'].includes(lvl)) for (const [id, [lat, lng]] of Object.entries(labels[lvl])) if (!selSet.has(id) && b.contains([lat, lng])) addLbl(lat, lng, (prefix ? LEVELS[lvl].abbr + ' ' : '') + id, 'k-' + lvl);
  if (lvl === 'zip' && z >= 11) for (const [id, [lat, lng]] of Object.entries(labels.zip)) if (!selSet.has(id) && b.contains([lat, lng])) addLbl(lat, lng, id, 'ed');
  if ((lvl === 'ed' || lvl === 'tract') && z >= 15 && !vintageMode()) {
    let n = 0;
    for (const [id, [lat, lng]] of Object.entries(labels[lvl])) {
      if (selSet.has(id) || !b.contains([lat, lng])) continue; if (++n > 450) break;
      addLbl(lat, lng, lvl === 'tract' ? tractCode(id) : (z >= 16 ? id : id.slice(2)), 'ed');
    }
  }
  if (hoodFallback && z >= 12 && !((lvl === 'ed' || lvl === 'tract') && z >= 15)) for (const [name, lat, lng] of hoods) if (b.contains([lat, lng])) addLbl(lat, lng, esc(name), 'hood');
  if (!vintageMode()) for (const id of state.sel[lvl]) { const p = labels[lvl] && labels[lvl][String(id)]; if (p) addLbl(p[0], p[1], esc(unitName(lvl, id)), 'sel'); }
  if (state.addr && state.addr.ll) addLbl(state.addr.ll[0], state.addr.ll[1], '<span class="pin"></span>', '');
}
map.on('moveend', renderLabels);

// ---------- small renderers ----------
function pbar(v, st) {
  const o = st * 7, t = v[o + 6];
  if (!t) return '<div class="pbar"></div>';
  return '<div class="pbar" role="img" aria-label="' + PARTIES.map((p, i) => `${PNAME[p]} ${pf(v[o + i] / t * 100, 0)}`).join(', ') + '">' + PARTIES.map((p, i) => `<span style="width:${v[o + i] / t * 100}%;background:${PCOL[p]}"></span>`).join('') + '</div>';
}
function sharesGrid(v, st, list = PARTIES) {
  return '<div class="shares">' + list.map(p => `<div><i style="background:${PCOL[p]}"></i><b>${pf(share(v, st, PARTIES.indexOf(p)), 0)}</b><span>${PABBR[p]}</span></div>`).join('') + '</div>';
}
function raceBar(c) {
  if (!c || !(c[F.pop] > 0)) return '<div class="pbar"></div>';
  const t = c[F.pop];
  return '<div class="pbar" role="img" aria-label="' + RACE.map(r => `${r.label} ${pf(c[F[r.num]] / t * 100, 0)}`).join(', ') + '">' + RACE.map(r => `<span style="width:${c[F[r.num]] / t * 100}%;background:${r.race}"></span>`).join('') + '</div>';
}
function raceGrid(c) {
  const t = c && c[F.pop]; if (!t) return '';
  return '<div class="shares">' + RACE.map(r => `<div><i style="background:${r.race}"></i><b>${pf(c[F[r.num]] / t * 100, 0)}</b><span>${r.label === 'Hispanic or Latino' ? 'Hispanic' : r.label === 'Other or multiracial' ? 'Other' : r.label}</span></div>`).join('') + '</div>';
}
function topGroups(c, filt, n = 3) {
  if (!c || !(c[F.pop] > 0)) return [];
  return CI.filter(i => !i.src || i.src === 'acs').filter(filt).map(i => [i, cval(i, {c})]).filter(([, x]) => x != null && x >= 1).sort((a, b) => b[1] - a[1]).slice(0, n);
}
// candidate bars for one place
function resBars(r, max = 5) {
  if (!r || !r.tot) return '<p class="caption">No votes counted here.</p>';
  const rows = r.items.slice(0, max).map(it => `<div class="cbar"><span class="cn">${esc(it.name)}</span><span class="ct"><i style="width:${(it.votes / r.tot * 100).toFixed(1)}%;background:${it.color}"></i></span><b>${pf(it.votes / r.tot * 100)}</b></div>`).join('');
  const rest = r.items.length > max ? `<div class="caption">${r.items.length - max} more</div>` : '';
  return `<div class="cbars">${rows}${rest}</div>`;
}
function memberText(id) {
  const m = EDM[id]; if (!m) return '';
  return `${m.boro} · Council ${m.cc ?? '–'} · Assembly ${m.ad} · Senate ${m.sd ?? '–'} · Congress ${m.cd ?? '–'}`;
}
function tractMain(t) {
  const pieces = TPIECES.get(t) || [], out = {};
  for (const k of ['cc','ad','sd','cd']) {
    const m = new Map(); for (const [ed, wp] of pieces) { const d = EDM[ed] && EDM[ed][k]; if (d != null) m.set(d, (m.get(d) || 0) + wp); }
    out[k] = [...m.entries()].sort((a, b) => b[1] - a[1]);
  }
  return out;
}
function subLine(lvl, id) {
  if (lvl === 'ed') return memberText(id);
  if (lvl === 'tract') { const m = tractMain(id), nta = TINFO[id] && TINFO[id][0]; return `${nta ? nta + ' · ' : ''}Mostly Council ${m.cc[0] ? m.cc[0][0] : '–'}, Assembly ${m.ad[0] ? m.ad[0][0] : '–'}`; }
  if (lvl === 'zip') return DON && DON.labels[id] && DON.labels[id] !== id ? `Includes ZIP codes ${DON.labels[id]}` : '';
  const u = AGG[lvl].get(id);
  const boros = [...new Set(u.eds.map(e => EDM[e].boro))];
  return `${fmt(u.eds.length)} election districts${lvl !== 'boro' ? ' · ' + boros.join(', ') : ''}`;
}

// hover card
const Hover = L.Control.extend({options:{position:'topright'}, onAdd() { this._d = L.DomUtil.create('div', 'hovercard'); this._d.hidden = true; return this._d; }});
const hover = new Hover().addTo(map);
function hoverBody(id, inPopup) {
  const lvl = state.level, f = famOf(state.metric);
  const vm = vintageMode();
  const title = vm ? `Election District ${id}` : unitLong(lvl, id);
  const sub = vm ? `On the ${curE().vintage.toUpperCase()} lines used in the ${ELSHORT[state.res.e]}` : subLine(lvl, id);
  let body = '';
  if (!available()) body = `<div class="hint">${esc(availText())}</div>`;
  else if (f === 'elections') {
    const r = unitRes(lvl, id), c = curC();
    if (!r) body = `<div class="hint">${c && c.scope[0] !== 'city' ? 'This race wasn’t on the ballot here.' : 'No results here.'}</div>`;
    else {
      const t = turnoutOf(c, lvl, id, r);
      body = `<div class="d" style="margin-top:6px">${esc((r.contest || c).title)}${r.final ? ' · final round' : ''}</div>${resBars(r, 4)}
        <div class="d" style="margin-top:6px">${fmt(r.b)} ballots${t != null ? ` · ${pf(t)} turnout` : ''}${r.final ? ` · ${pf(r.b ? r.inact / r.b * 100 : null)} exhausted` : ''}</div>
        ${r.host ? `<div class="hint">Votes reported together with ED ${r.host}.</div>` : ''}${r.partialCover ? '<div class="hint">Only part of this district voted in this race.</div>' : ''}`;
    }
  } else if (f === 'residents') {
    const ind = CIK[cKey(state.metric)], ctx = unitCtx(lvl, id), c = ctx.c, r = ev(ind, ctx);
    body = `<div class="v"><span>${esc(ind.short || ind.label)}</span><b>${fmtC(ind, r.x)} <small class="moe">${fmtMoe(ind, r.moe)}</small></b></div>${r.rel === 'low' || r.rel === 'medium' ? `<div class="hint" style="margin-top:2px">${relBadge(r.rel)}</div>` : ''}${raceBar(c)}
      <div class="d" style="margin-top:6px">${fmt(c ? c[F.pop] : null)} residents · ${fmtC(CIK.cvap, cval(CIK.cvap, ctx))} eligible voters</div>`;
  } else if (f === 'field') {
    const a = doorsOf(lvl, id);
    body = `<div class="v"><span>${esc(FIELDK[state.metric.slice(2)].label)}</span><b>${fmtValue(mapValue(lvl, id))}</b></div>${a ? homesBar(a) : ''}<div class="d" style="margin-top:6px">${fmt(a ? a[DF.units] : null)} homes · ${fmt(AGG[lvl].get(id) ? AGG[lvl].get(id).v[13] : null)} active voters</div>`;
  } else if (f === 'conditions') {
    const k = state.metric.slice(2), n = condCount(k, lvl, id), rate = condValue(k, lvl, id, 'rate');
    body = `<div class="v"><span>${esc(CONDK[k].label)}</span><b>${fmt(n)}</b></div><div class="d">${rate != null ? `${rate.toFixed(1)} per 1,000 ${CONDK[k].per === 'hu' ? 'homes' : 'residents'}` : 'Too few residents for a rate'} · July 2025 to June 2026</div>`;
  } else if (f === 'money') {
    const k = state.metric.slice(2);
    if (k === 'fund') { const fd = FUND && FUND.cc[String(id)]; body = fd ? `<div class="v"><span>FY2027 designations</span><b>${money(fd.total)}</b></div><div class="d">${fmt(fd.n)} grants to ${fmt(fd.orgs)} groups</div>` : ''; }
    else { const a = DON && DON.areas[id] || {}; body = `<div class="v"><span>${esc(MONEYK[k].label)}</span><b>${fmtValue(mapValue(lvl, id))}</b></div><div class="d">City races ${money(a.cfb ? a.cfb.total : 0)} · Federal ${money(a.fec ? a.fec.total : 0)}</div>`; }
  } else {
    const u = AGG[lvl].get(id), v = u ? u.v : ZERO, st = state.status, ctx = unitCtx(lvl, id), c = ctx.c;
    body = `<div class="v"><span>${fmt(v[st * 7 + 6])} ${STATUS_WORD[st]}${lvl === 'tract' ? ' (est.)' : ''}</span><b>${fmtMetric(state.metric, metricValue(v, state.metric, st))}</b></div>${pbar(v, st)}${sharesGrid(v, st, ['dem','rep','blank'])}
      <div class="d" style="margin-top:6px">${fmt(c ? c[F.pop] : null)} residents · ${fmtC(CIK.reg, cval(CIK.reg, ctx))} active voters per 100 eligible</div>`;
  }
  const p = partial(lvl, id);
  return `<div class="t">${esc(title)}</div><div class="d">${esc(sub)}</div>${body}
    ${p && !vm ? `<div class="hint">NYC part only (${p.nyc_share}% of district residents)</div>` : ''}
    ${inPopup ? '' : `<div class="hint">${vm ? 'Click for details' : state.sel[lvl].includes(id) ? 'Click to remove from your picks' : 'Click to pick'}</div>`}`;
}
function showHover(id) {
  const d = hover._d;
  if (id == null || matchMedia('(hover: none)').matches) { d.hidden = true; return; }
  d.hidden = false; d.innerHTML = hoverBody(id);
}

// legend
const Legend = L.Control.extend({options:{position:'bottomleft'}, onAdd() {
  this._d = L.DomUtil.create('div', 'legend'); L.DomEvent.disableClickPropagation(this._d); L.DomEvent.disableScrollPropagation(this._d); return this._d; }});
const legend = new Legend().addTo(map);
let legendOpen = !NARROW();
function renderLegend() {
  const m = state.metric, f = famOf(m), ind = isCensus(m) ? CIK[cKey(m)] : null;
  let rows = [], sub = '';
  if (!available()) { rows = []; sub = availText(); }
  else if (f === 'elections' && state.res.v === 'lead') {
    const seen = new Map();
    for (const id of fillIds()) { const r = unitRes(state.level, id); if (r && r.tot && r.items[0].votes > 0) { const it = r.items[0]; if (!seen.has(it.name)) seen.set(it.name, [it, 0]); seen.get(it.name)[1]++; } }
    const list = [...seen.values()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    rows = list.map(([it, n]) => `<div class="st st3"><i style="background:${mix(it.color, .42)}"></i><i style="background:${mix(it.color, .7)}"></i><i style="background:${it.color}"></i><span>${esc(it.short === it.name ? it.name : it.short)} <small>(${n})</small></span></div>`);
    rows.push(`<div class="st"><i style="background:${css('--nodata')}"></i><span>Not on the ballot here, or no votes</span></div>`);
    sub = `Lighter to darker: led by under ${LEAD_BINS[0]}, ${LEAD_BINS[0]} to ${LEAD_BINS[1]}, or over ${LEAD_BINS[1]} points. Number of ${LEVELS[state.level].plural} won in brackets.`;
  } else {
    const fv = x => fmtValue(x, true);
    rows = cols.map((c, i) => {
      const lo = i === 0 ? null : breaks[i - 1], hi = i < breaks.length ? breaks[i] : null;
      const A = shortName(state.res.a || ''), B = shortName(state.res.b || ''), n = x => Math.abs(Math.round(x));
      const txt = diverging ? (lo == null ? `${B} by ${n(hi)}+` : hi == null ? `${A} by ${n(lo)}+` : lo < 0 && hi <= 0 ? `${B} by ${n(hi)} to ${n(lo)}` : lo >= 0 ? `${A} by ${n(lo)} to ${n(hi)}` : `Within ${n(hi)} points`)
        : lo == null ? `Under ${fv(hi)}` : hi == null ? `${fv(lo)} or more` : `${fv(lo)} to ${fv(hi)}`;
      return `<div class="st"><i style="background:${c}"></i><span>${txt}</span></div>`;
    });
    rows.push(`<div class="st"><i style="background:${css('--nodata')}"></i><span>${f === 'residents' ? 'Too few residents' : f === 'conditions' ? (state.cmode === 'rate' ? 'Too few residents for a rate' : 'None') : f === 'elections' ? 'Not on the ballot here' : f === 'field' ? 'Too few homes' : f === 'money' ? 'No data' : 'No registered voters'}</span></div>`);
    if (ind && state.fade) rows.push(`<div class="st"><i style="background:${cols[Math.floor(cols.length / 2)]};opacity:.3"></i><span>Faded: low reliability</span></div>`);
    sub = m === 'margin' ? 'D+20 means Democrats outnumber Republicans by 20 points.' : diverging ? 'Points ahead, as a share of all votes cast for this office.' : breaks[0] === .5 && ind && !ind.type ? `Lightest color: almost none. The other colors each cover about the same number of ${LEVELS[state.level].plural}.` : `Each color covers about the same number of ${LEVELS[state.level].plural}.`;
    if (ind) sub += ` Census ${ind.src === 'cvap' ? 'citizen voting-age tabulation' : 'ACS'} 2020–2024${state.level === 'tract' ? '' : ', split into districts by 2020 population'}.`;
    else if (f === 'voters' && m !== 'inactive' && state.status) sub += ` Counting ${STATUS_WORD[state.status]} only.`;
    else if (f === 'conditions') sub += ' July 2025 to June 2026.';
  }
  legend._d.innerHTML = `<details ${legendOpen ? 'open' : ''}><summary>${esc(metricTitle(m))}</summary><div class="lsub">${esc(sub)}</div><div class="steps">${rows.join('')}</div></details>`;
  legend._d.querySelector('details').addEventListener('toggle', e => { legendOpen = e.target.open; });
}
function availText() {
  const m = state.metric, lv = levelsFor(m);
  if (famOf(m) === 'elections') {
    const c = curC();
    if (!c) return 'Pick a race.';
    if (state.level === 'tract' || state.level === 'zip') return 'Election results come by election district, which don’t fit inside census tracts or ZIP codes. Pick another view.';
    if (c.group && c.party) return `Each ${LEVELS[c.scope[0]].name.toLowerCase()} primary had its own candidates, so this view works by ${LEVELS[c.scope[0]].name.toLowerCase()} or election district.`;
  }
  return `This is counted by ${lv.map(l => LEVELS[l].name.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' or $1')}. Switch views to see it.`;
}
function renderAvail() {
  const el = $('#availNote');
  if (available()) { el.hidden = true; return; }
  const m = state.metric;
  let lv = levelsFor(m);
  if (m === 'r') { const c = curC(); if (c && c.group && c.party) lv = [c.scope[0], 'ed']; }
  el.innerHTML = `${esc(availText())} <span class="row" style="margin-top:6px">${lv.filter(l => l !== state.level).slice(0, 4).map(l => `<button type="button" class="btn" data-lv="${l}">Show by ${esc(LEVELS[l].name.replace('City Council District', 'Council district').toLowerCase())}</button>`).join('')}</span>`;
  el.hidden = false;
  $$('#availNote [data-lv]').forEach(b => b.addEventListener('click', () => setLevel(b.dataset.lv)));
}

// ---------- picking ----------
function refreshUnit(id) { const l = layerById.get(id); if (l) l.setStyle(baseStyle(l.feature)); }
function toggleSel(id, fromMap) {
  const a = state.sel[state.level], i = a.indexOf(id);
  if (i >= 0) a.splice(i, 1); else a.push(id);
  refreshUnit(id); if (i < 0) { const l = layerById.get(id); if (l) l.bringToFront(); }
  if (hoverId === id) showHover(id);
  afterSelChange();
  if (fromMap && i < 0 && NARROW()) toast(`${unitName(state.level, id)} picked. Details are below the map.`);
}
function addMany(ids) {
  const a = state.sel[state.level]; let n = 0;
  for (const id of ids) if (!a.includes(id) && AGG[state.level].has(id)) { a.push(id); n++; refreshUnit(id); }
  bringSelToFront(); afterSelChange(); return n;
}
function clearSel() { const a = state.sel[state.level].splice(0); a.forEach(refreshUnit); afterSelChange(); }
function zoomToSel() {
  const ls = state.sel[state.level].map(id => layerById.get(id)).filter(Boolean);
  if (!ls.length) return;
  const b = L.featureGroup(ls).getBounds();
  if (b.isValid()) map.flyToBounds(b, {padding:[40, 40], maxZoom:16, duration:.6});
}
function afterSelChange() { renderSel(); renderTray(); renderLabels(); writeHash(); if ($('#cmpDlg').open) renderCompare(); }

function parseIds(text) {
  const out = [], lvl = state.level;
  for (let tok of text.split(/[,\s;]+/).filter(Boolean)) {
    tok = tok.replace(/^(ed|cc|ad|sd|cd|council|assembly|senate|congress|district|tract|zip|#)+/i, '');
    if (!tok) continue;
    if (lvl === 'boro') { const hit = [...AGG.boro.keys()].find(k => k.toLowerCase().startsWith(tok.toLowerCase())); if (hit) out.push(hit); continue; }
    if (lvl === 'tract') { if (/^36\d{9}$/.test(tok)) out.push(tok); continue; }
    if (lvl === 'zip') { const z = zipArea(tok); if (z) out.push(z); continue; }
    const r = tok.match(/^(\d+)-(\d+)$/);
    if (r) { let a = +r[1], b = +r[2]; if (b < a) [a, b] = [b, a]; if (b - a <= 2000) for (let i = a; i <= b; i++) out.push(i); }
    else if (/^\d+$/.test(tok)) out.push(+tok);
  }
  return out;
}
const ZIP_TO_AREA = {};
function zipArea(z) {
  if (AGG.zip.has(z)) return z;
  if (!Object.keys(ZIP_TO_AREA).length && DON) for (const [a, lab] of Object.entries(DON.labels)) for (const x of String(lab).match(/\d{5}/g) || []) ZIP_TO_AREA[x] = a;
  return ZIP_TO_AREA[z] || null;
}
$('#addBtn').addEventListener('click', () => {
  const ids = parseIds($('#addBox').value), n = addMany(ids), skipped = ids.length - n;
  $('#addMsg').textContent = !ids.length ? 'Type one or more numbers first.' : `Added ${n}.` + (skipped ? ` ${skipped} skipped because they’re already picked or don’t exist in this view.` : '');
  if (n) { $('#addBox').value = ''; zoomToSel(); }
});
$('#addBox').addEventListener('keydown', e => { if (e.key === 'Enter') $('#addBtn').click(); });
function fillFilter() {
  for (const k of ['cc','ad','sd','cd'])
    $('#f-' + k).innerHTML = `<option value="">Any ${LEVELS[k].short.toLowerCase()} district</option>` + sortIds(k).map(id => `<option value="${id}">${LEVELS[k].short} ${id}</option>`).join('');
}
fillFilter();
$('#filterBtn').addEventListener('click', () => {
  const c = {}; for (const k of ['cc','ad','sd','cd']) { const v = $('#f-' + k).value; if (v) c[k] = +v; }
  if (!Object.keys(c).length) { $('#addMsg').textContent = 'Choose at least one district first.'; return; }
  const ids = Object.entries(EDM).filter(([id, m]) => EDV[id] && Object.entries(c).every(([k, v]) => m[k] === v)).map(([id]) => +id);
  const n = addMany(ids);
  $('#addMsg').textContent = ids.length ? `${ids.length} election districts match. ${n} added.` : 'No election districts sit in that combination.';
  if (n) zoomToSel();
});
let boxStart = null, boxRect = null;
const mc = map.getContainer();
mc.addEventListener('mousedown', e => {
  if (!e.shiftKey || e.button !== 0 || vintageMode()) return;
  e.stopPropagation(); e.preventDefault();
  boxStart = map.mouseEventToLatLng(e);
  boxRect = L.rectangle([boxStart, boxStart], {color:css('--sel'), weight:1.5, dashArray:'4 3', fillOpacity:.08, interactive:false}).addTo(map);
}, true);
document.addEventListener('mousemove', e => { if (boxRect) boxRect.setBounds([boxStart, map.mouseEventToLatLng(e)]); });
document.addEventListener('mouseup', () => {
  if (!boxRect) return;
  const b = boxRect.getBounds(); map.removeLayer(boxRect); boxRect = null;
  if (b.getNorthEast().equals(b.getSouthWest())) return;
  const ids = Object.entries(labels[state.level]).filter(([, [lat, lng]]) => b.contains([lat, lng])).map(([id]) => ['boro','tract','zip'].includes(state.level) ? id : +id);
  const n = addMany(ids); toast(`Picked ${n} ${n === 1 ? LEVELS[state.level].name.toLowerCase() : LEVELS[state.level].plural}.`);
});

// ---------- profile blocks ----------
const ROLE = {cc:'Council Member', ad:'Assembly Member', sd:'State Senator', cd:'Member of Congress'};
const longDate = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'});
function repList(lvl, id) {
  const out = [], add = (k, d) => { const r = REPS[k] && REPS[k][String(d)]; if (r) out.push({k, d, r}); };
  if (['cc','ad','sd','cd'].includes(lvl)) add(lvl, id);
  else if (lvl === 'ed' && EDM[id]) for (const k of ['cc','ad','sd','cd']) if (EDM[id][k] != null) add(k, EDM[id][k]);
  return out;
}
function repHTML({k, d, r}, compact) {
  const role = `${ROLE[k]} · ${LEVELS[k].short} ${d}`;
  if (r.vacant) return `<div class="rep"><div class="rep-role">${esc(role)}</div><div class="rep-name">Vacant</div><div class="caption">No one holds this seat right now. The winner of the ${longDate(r.next_election)} election takes office in January.</div></div>`;
  const contact = [r.phone ? `<a href="tel:${esc(r.phone.replace(/[^\d]/g, ''))}">${esc(r.phone)}</a>` : '', r.email ? `<a href="mailto:${esc(r.email)}">Email</a>` : '', r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Website</a>` : ''].filter(Boolean).join(' · ');
  const notes = [];
  if (r.took_office_after_last_general) notes.push(`Took office after the ${k === 'cc' ? '2025' : '2024'} election, which ${esc(r.last_election.winner)} won.`);
  if (k !== 'cc' && r.next_election === '2026-11-03') notes.push('On the ballot November 3, 2026.');
  return `<div class="rep"><div class="rep-role">${esc(role)}${r.title ? ` · <b>${esc(r.title)}</b>` : ''}</div><div class="rep-name">${esc(r.name)}${r.party ? ` <span class="rep-party p-${esc(r.party.slice(0, 3).toLowerCase())}">${esc(r.party)}</span>` : ''}</div>
    ${compact ? '' : `${r.office ? `<div class="caption">${k === 'cd' ? 'Washington office' : 'District office'}: ${esc(r.office)}</div>` : ''}`}
    ${contact ? `<div class="rep-contact">${contact}</div>` : ''}${notes.length ? `<div class="caption">${notes.join(' ')}</div>` : ''}</div>`;
}
function repsBlock(lvl, id, open) {
  if (lvl === 'boro') { const bp = (REPS.city || []).find(c => c.office === 'Borough President' && c.area === id); return bp ? `<details class="res" ${open ? 'open' : ''}><summary>Who represents it</summary><div class="res-body"><div class="rep"><div class="rep-role">Borough President</div><div class="rep-name">${esc(bp.name)}</div><div class="caption">Elected November 2025.</div></div></div></details>` : ''; }
  const list = repList(lvl, id); if (!list.length) return '';
  return `<details class="res" ${open ? 'open' : ''}><summary>Who represents it</summary><div class="res-body reps">${list.map(x => repHTML(x, lvl === 'ed')).join('')}</div></details>`;
}
function siteHTML(s, kind) {
  if (s == null) return '';
  const [name, addr, boro] = SITES[s];
  return `<div class="site"><div class="rep-role">${kind === 'eday' ? `Election Day, Nov 3 · ${esc(POLLS.eday_hours)}` : 'Early voting, Oct 24 to Nov 1'}</div><div class="rep-name">${esc(name)}</div><div class="caption">${esc(addr)}, ${esc(boro)} · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr + ', ' + boro + ', NY')}" target="_blank" rel="noopener">Directions</a></div></div>`;
}
function newEdWarning(ad) {
  const n = POLLS.new_eds_by_ad[String(ad)];
  return n ? `<div class="note">The Board of Elections added ${n.length} new election district${n.length === 1 ? '' : 's'} in Assembly District ${ad} for this election that aren’t on any city map yet. Confirm your site at <a href="${POLLS.lookup}" target="_blank" rel="noopener">findmypollsite.vote.nyc</a>.</div>` : '';
}
function pollBlock(ed) {
  const p = POLL_ED[String(ed)]; if (!p) return '';
  return `<div class="sites">${siteHTML(p[0], 'eday')}${p[1] !== p[0] ? siteHTML(p[1], 'early') : `<div class="caption">Early voting, October 24 to November 1, is at the same site.</div>`}</div>${newEdWarning(EDM[ed] && EDM[ed].ad)}`;
}
const HOME_SEG = [['u1_2','1–2 units','#9fb7d4'], ['u3_9','3–9','#6b90bd'], ['u10_49','10–49','#3f6894'], ['u50','50+','#1f3d5f']];
function homesBar(a) {
  const t = a[DF.units]; if (!(t > 0)) return '';
  return '<div class="pbar" role="img" aria-label="' + HOME_SEG.map(([k, l]) => `${l} ${pf(a[DF[k]] / t * 100, 0)}`).join(', ') + '">' + HOME_SEG.map(([k, , c]) => `<span style="width:${a[DF[k]] / t * 100}%;background:${c}"></span>`).join('') + '</div>';
}
function homesBlock(lvl, id, open) {
  const a = doorsOf(lvl, id); if (!a || !(a[DF.units] > 0)) return '';
  const t = a[DF.units], v = AGG[lvl] && AGG[lvl].get(id) ? AGG[lvl].get(id).v : null;
  const sites = lvl === 'ed' ? pollBlock(id) : (() => { if (!AGG[lvl] || !AGG[lvl].get(id)) return ''; const s = new Set(AGG[lvl].get(id).eds.map(e => POLL_ED[e] && POLL_ED[e][0]).filter(x => x != null)); return s.size ? `<div class="member">${fmt(s.size)} Election Day poll sites serve this ${lvl === 'tract' ? 'tract' : 'district'}. <button type="button" class="linkish" data-polls="1">Show them on the map</button></div>` : ''; })();
  return `<details class="res" ${open ? 'open' : ''}><summary>Homes and where to vote</summary><div class="res-body">
    <div class="stats"><div class="stat"><span>Homes</span><b>${fmt(t)}</b></div><div class="stat"><span>Active voters per 100 homes</span><b>${v && t >= 20 ? (v[13] / t * 100).toFixed(0) : '–'}</b></div>
      <div class="stat"><span>In NYCHA</span><b>${pf(a[DF.nycha] / t * 100, 0)}</b></div><div class="stat"><span>Buildings</span><b>${fmt(a[DF.bldgs])}</b></div></div>
    ${homesBar(a)}<div class="shares shares4">${HOME_SEG.map(([k, l, c]) => `<div><i style="background:${c}"></i><b>${pf(a[DF[k]] / t * 100, 0)}</b><span>${l}</span></div>`).join('')}</div>
    ${sites}</div></details>`;
}
function condBlock(lvl, id, open) {
  if (!CAGG || !CAGG[lvl]) return '';
  const keys = ['311_total','311_heat','311_rodent','311_noise','hpd_c','evict_evict','nypd_violent','nypd_property'];
  const rows = keys.map(k => { const n = condCount(k, lvl, id), r = condValue(k, lvl, id, 'rate'), cr = condValue(k, 'cc', '__city', 'rate');
    return `<div class="stat"><span>${esc(CONDK[k].label)}</span><b title="${fmt(n)} in 12 months">${r != null ? r.toFixed(1) : fmt(n)}${r != null && cr ? `<i class="vs ${r > cr * 1.25 ? 'hi' : r < cr * .8 ? 'lo' : ''}" aria-hidden="true"></i>` : ''}</b></div>`; }).join('');
  return `<details class="res" ${open ? 'open' : ''}><summary>Conditions</summary><div class="res-body"><p class="caption">Per 1,000 residents (housing items per 1,000 homes), July 2025 to June 2026. <i class="vs hi"></i> well above the city rate, <i class="vs lo"></i> well below.</p><div class="stats">${rows}</div></div></details>`;
}
function fundBlock(id, open) {
  if (!FUND) return `<details class="res" data-lazy="fund" ${open ? 'open' : ''}><summary>Council discretionary funding</summary><div class="res-body"><p class="caption">Loading…</p></div></details>`;
  const f = FUND.cc[String(id)]; if (!f) return '';
  const top = f.rows.slice(0, 5).map(r => `<div class="stat"><span title="${esc(r[6])}">${esc(r[0])}</span><b>${money(r[1])}</b></div>`).join('');
  return `<details class="res" ${open ? 'open' : ''}><summary>Council discretionary funding</summary><div class="res-body">
    <div class="big">${money(f.total)}<small>to ${fmt(f.orgs)} groups in ${fmt(f.n)} grants, fiscal year 2027</small></div>
    <div class="member">${Object.entries(f.by_category).map(([k, v]) => `<b>${esc(k)}</b> ${money(v)}`).join(' · ')}</div>
    <div class="stats stats1">${top}</div>
    <button type="button" class="linkish" data-fundlist="${id}">See all ${fmt(f.n)} grants</button>
    <p class="caption">From the Council’s funding disclosure as of ${esc(FUND.as_of)}. Citywide initiatives and the Speaker’s designations aren’t credited to a district.</p></div></details>`;
}
function zipBlock(id) {
  if (!DON) return '<p class="caption">Loading…</p>';
  const a = DON.areas[id] || {}, c = a.cfb, f = a.fec, pop = +DON.pop[id] || 0;
  const tops = list => list.map(([n, v]) => `<div class="stat"><span>${esc(n)}</span><b>${money(v)}</b></div>`).join('');
  return `<div class="res-body">
    ${pop ? `<div class="member">About ${fmt(pop)} residents.</div>` : ''}
    <h4 class="mini">2025 city races</h4>
    ${c ? `<div class="big">${money(c.total)}<small>from ${fmt(c.donors)} donors</small></div><div class="member">${pf(c.small / c.total * 100, 0)} came in gifts of $250 or less. ${Object.entries(c.by_office).map(([k, v]) => `<b>${esc(k)}</b> ${money(v)}`).join(' · ')}</div><div class="stats stats1">${tops(c.top.slice(0, 5))}</div>` : '<p class="caption">No contributions recorded.</p>'}
    <h4 class="mini">Federal, 2025–2026</h4>
    ${f ? `<div class="big">${money(f.total)}<small>from ${fmt(f.donors)} donors</small></div><div class="member">${Object.entries(f.by_party).map(([k, v]) => `<b>${esc(k)}</b> ${money(v)}`).join(' · ')}</div><div class="stats stats1">${tops(f.top.slice(0, 5))}</div>` : '<p class="caption">No itemized contributions recorded.</p>'}
    <p class="caption">By the donor’s ZIP code. Federal totals only list donors who gave a committee more than $200.</p></div>`;
}
// results in one place for the race on the map, and a lazily built list of recent races
function resBlock(lvl, id, open) {
  const out = [];
  if (state.metric === 'r' && curC() && available() && !vintageMode()) {
    const r = unitRes(lvl, id), c = curC();
    out.push(`<div class="res-race"><div class="rep-role">${esc(ELSHORT[state.res.e])}${r && r.final ? ' · final round' : ''}</div><div class="rep-name">${esc((r && r.contest || c).title)}</div>${r ? resBars(r, 5) + `<div class="caption">${fmt(r.b)} ballots${turnoutOf(c, lvl, id, r) != null ? ` · ${pf(turnoutOf(c, lvl, id, r))} turnout` : ''}${r.partialCover ? ' · only part of this district voted in this race' : ''}</div>` : '<p class="caption">Not on the ballot here.</p>'}</div>`);
  }
  if (['cc','ad','sd','cd','boro','ed'].includes(lvl)) out.push(`<div data-lazy="races" data-l="${lvl}" data-i="${esc(id)}"><button type="button" class="linkish" data-races="1">Show recent races here</button></div>`);
  if (!out.length) return '';
  return `<details class="res" ${open ? 'open' : ''}><summary>Elections</summary><div class="res-body">${out.join('')}</div></details>`;
}
async function racesHTML(lvl, id) {
  const parts = [];
  for (const e of ELX) {
    const E = await loadElection(e.id);
    if (lvl === 'ed' && !E.same_lines_as_map) continue;
    const top = E.contests.filter(c => c.scope[0] === 'city' && !prep(c).proposal).sort((a, b) => b.ballots - a.ballots).slice(0, e.id.endsWith('primary') ? 2 : 1);
    const own = ['cc','ad','sd','cd'].includes(lvl) ? E.contests.filter(c => c.scope[0] === lvl && String(c.scope[1]) === String(id)) : lvl === 'boro' ? E.contests.filter(c => c.scope[0] === 'boro' && c.scope[1] === id && /Borough President/.test(c.office)) : [];
    for (const c of [...top, ...own]) {
      const save = state.res; state.res = {e:e.id, c:c.id, v:'lead', round: c.rcv ? 'final' : '1'};
      let r = null; try { r = unitRes(lvl, id); } finally { state.res = save; }
      if (!r || !r.tot) continue;
      parts.push(`<div class="res-race"><div class="rep-role">${esc(ELSHORT[e.id])}${r.final ? ' · final round' : ''}</div><div class="rep-name">${esc(c.title)}</div>${resBars(r, 3)}<div class="caption">${fmt(r.b)} ballots</div></div>`);
    }
  }
  return parts.length ? parts.join('') + (lvl === 'ed' ? '<p class="caption">Earlier elections used different election district lines. Switch to a district view to see them here.</p>' : '') : '<p class="caption">No results found here.</p>';
}
function residentsBlock(ctx, open) {
  const c = ctx.c;
  if (!c || !(c[F.pop] > 0)) return '<div class="res"><p class="caption">No census residents counted here.</p></div>';
  const stat = (k) => { const i = CIK[k], r = ev(i, ctx); return `<div class="stat"><span>${esc(i.short || i.label)}</span><b title="${esc(fmtMoe(i, r.moe) ? 'Margin of error ' + fmtMoe(i, r.moe) : '')}">${fmtC(i, r.x)}${r.rel === 'low' ? ' <i class="reldot rel-low" aria-label="low reliability" title="' + REL_TEXT.low + '"></i>' : r.rel === 'medium' ? ' <i class="reldot rel-medium" aria-label="medium reliability" title="' + REL_TEXT.medium + '"></i>' : ''}</b></div>`; };
  const groups = topGroups(c, i => i.origin && !['n_wi'].includes(i.k)).map(([i, x]) => `${esc(i.label)} ${pf(x, 0)}`).join(' · ');
  const langs = topGroups(c, i => i.lang, 2).map(([i, x]) => `${esc(i.short)} ${pf(x, 0)}`).join(' · ');
  return `<details class="res" ${open ? 'open' : ''}><summary>Who lives here</summary>
    <div class="res-body">
      <div class="stats">${stat('pop')}${stat('cvap')}${stat('reg')}${stat('med_inc')}${stat('pov')}${stat('renter')}${stat('lep_hh')}${stat('fborn')}</div>
      ${raceBar(c)}${raceGrid(c)}
      ${groups ? `<div class="member"><b>Largest origin groups:</b> ${groups}</div>` : ''}
      ${langs ? `<div class="member"><b>Top languages besides English:</b> ${langs}</div>` : ''}
    </div></details>`;
}
function cardHTML(lvl, id, open) {
  if (lvl === 'zip') return `<div class="card"><div class="card-head"><div><div class="card-title">${esc(unitLong(lvl, id))}</div><div class="card-sub">${esc(subLine(lvl, id))}</div></div>
    <button type="button" class="x" data-rm="${esc(id)}" aria-label="Remove ${esc(unitName(lvl, id))}">×</button></div>${zipBlock(id)}</div>`;
  const u = AGG[lvl].get(id), v = u.v, st = state.status, p = partial(lvl, id), ctx = unitCtx(lvl, id);
  let member = '';
  if (lvl === 'ed' && EDM[id]) member = `<div class="member">${EDM[id].boro} · ` + ['cc','ad','sd','cd'].filter(k => EDM[id][k] != null).map(k => `<button type="button" data-goto="${k}:${EDM[id][k]}">${LEVELS[k].short} ${EDM[id][k]}</button>`).join(' · ') + '</div>';
  if (lvl === 'tract') { const m = tractMain(id); member = `<div class="member">${tractBoro(id)} · ` + ['cc','ad','sd','cd'].filter(k => m[k][0]).map(k => `<button type="button" data-goto="${k}:${m[k][0][0]}">${LEVELS[k].short} ${m[k][0][0]}</button>`).join(' · ') + (m.cc.length > 1 || m.ad.length > 1 ? ' <span class="caption">(mostly)</span>' : '') + '</div>'; }
  const f = famOf(state.metric);
  return `<div class="card">
    <div class="card-head"><div><div class="card-title">${esc(unitLong(lvl, id))}</div>${lvl === 'ed' ? '' : `<div class="card-sub">${esc(lvl === 'tract' ? (TINFO[id] && TINFO[id][0]) || '' : subLine(lvl, id))}</div>`}</div>
      <button type="button" class="x" data-rm="${esc(id)}" aria-label="Remove ${esc(unitName(lvl, id))}">×</button></div>
    ${member}
    <div class="big">${fmt(v[st * 7 + 6])}<small>${STATUS_WORD[st]}${lvl === 'tract' ? ', estimated' : ''}</small></div>
    ${pbar(v, st)}${sharesGrid(v, st)}
    ${p ? `<div class="note">Only part of this district is in NYC (${p.nyc_share}% of its residents). These counts cover that part; the rest is in ${esc(p.outside)}.</div>` : ''}
    ${open ? repsBlock(lvl, id, true) : ''}
    ${lvl !== 'tract' ? resBlock(lvl, id, open && f === 'elections') : ''}
    ${residentsBlock(ctx, open && (f === 'residents' || f === 'voters'))}
    ${homesBlock(lvl, id, open && f === 'field')}
    ${lvl !== 'tract' ? condBlock(lvl, id, open && f === 'conditions') : ''}
    ${lvl === 'cc' ? fundBlock(id, open && f === 'money') : ''}
  </div>`;
}
function compactRow(lvl, id) {
  if (lvl === 'zip') { const a = DON && DON.areas[id] || {}; return `<div class="card compact"><div class="card-head"><div class="card-title">${esc(unitName(lvl, id))}<span class="card-sub">City ${money(a.cfb ? a.cfb.total : 0)} · Federal ${money(a.fec ? a.fec.total : 0)}</span></div><button type="button" class="x" data-rm="${esc(id)}" aria-label="Remove ${esc(unitName(lvl, id))}">×</button></div></div>`; }
  const v = AGG[lvl].get(id).v, st = state.status;
  return `<div class="card compact"><div class="card-head"><div class="card-title">${esc(unitName(lvl, id))}<span class="card-sub">${fmt(v[st * 7 + 6])} ${STATUS_WORD[st]}</span></div>
    <button type="button" class="x" data-rm="${esc(id)}" aria-label="Remove ${esc(unitName(lvl, id))}">×</button></div>${pbar(v, st)}</div>`;
}
function combined(lvl, ids) {
  const v = new Array(21).fill(0); let n = 0;
  for (const id of ids) { const u = AGG[lvl].get(id); for (let i = 0; i < 21; i++) v[i] += u.v[i]; n += u.eds.length; }
  const k = CityCore.combine(model, lvl, ids), q = CityCore.combine(cvapModel, lvl, ids);
  return {v, n, c:k.c, ctx:{c:k.c, m:k.m, split:k.split, cvap:{c:q.c, m:q.m, split:q.split}, v}};
}
function renderSel() {
  const lvl = state.level, ids = state.sel[lvl], st = state.status;
  $('#selCount').hidden = !ids.length; $('#selCount').textContent = `${ids.length} picked`;
  if (!ids.length) {
    const ex = (EXAMPLES[lvl] || []).map(([arr, t], i) => `<button type="button" class="ex" data-ex="${i}">${esc(t)}</button>`).join('');
    $('#selBody').innerHTML = `<div class="empty"><p>${lvl === 'zip' ? 'Click ZIP code areas on the map to see who their donors gave to.' : `Click ${LEVELS[lvl].plural} on the map, or search above. Pick one to see its full profile: who represents it, how it voted, who lives there, its homes and conditions. Pick several to compare them side by side.`}</p>
      ${ex ? `<div class="examples"><span class="caption" style="align-self:center">Try</span>${ex}</div>` : ''}</div>`;
    $$('#selBody [data-ex]').forEach(b => b.addEventListener('click', () => { addMany(EXAMPLES[lvl][+b.dataset.ex][0]); zoomToSel(); }));
    return;
  }
  let html = '';
  if (ids.length > 1 && lvl !== 'zip') {
    const {v, n, ctx} = combined(lvl, ids);
    html += `<div class="card combined"><div class="card-head"><div><div class="card-title">All ${ids.length} together</div><div class="card-sub">${lvl === 'tract' ? 'Voter counts estimated' : fmt(n) + ' election districts'}</div></div></div>
      <div class="big">${fmt(v[st * 7 + 6])}<small>${STATUS_WORD[st]}</small></div>${pbar(v, st)}${sharesGrid(v, st)}${residentsBlock(ctx, true)}</div>`;
  }
  html += `<div class="sel-actions">
    <button type="button" class="btn primary" data-act="compare">${ids.length > 1 ? 'Compare in a table' : 'See every number'}</button>
    <button type="button" class="btn" data-act="download">Download</button>
    <button type="button" class="btn" data-act="zoom">Zoom to</button>
    <button type="button" class="btn ghost" data-act="clear">Clear</button></div>`;
  html += '<div class="cards">' + ids.map(id => ids.length > 4 ? compactRow(lvl, id) : cardHTML(lvl, id, ids.length === 1)).join('') + '</div>';
  $('#selBody').innerHTML = html;
  wireCards($('#selBody'));
}
function wireCards(root) {
  const lvl = state.level;
  root.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => toggleSel(['boro','tract','zip'].includes(lvl) ? b.dataset.rm : +b.dataset.rm)));
  root.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => { const [k, v] = b.dataset.goto.split(':'); goTo(k, ['boro','tract','zip'].includes(k) ? v : +v); }));
  root.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => ACTIONS[b.dataset.act]()));
  root.querySelectorAll('[data-polls]').forEach(b => b.addEventListener('click', () => { if (!state.polls.has('eday')) { state.polls.add('eday'); setPolls('eday', true); renderLineToggles(); writeHash(); } zoomToSel(); }));
  root.querySelectorAll('[data-fundlist]').forEach(b => b.addEventListener('click', () => openFundList(+b.dataset.fundlist)));
  root.querySelectorAll('[data-races]').forEach(b => b.addEventListener('click', async () => {
    const box = b.closest('[data-lazy="races"]'); box.innerHTML = '<p class="caption">Loading four elections…</p>';
    try { box.innerHTML = await racesHTML(box.dataset.l, ['boro','tract','zip'].includes(box.dataset.l) ? box.dataset.i : +box.dataset.i); } catch (e) { box.innerHTML = '<p class="caption">Results didn’t load. Try again.</p>'; }
  }));
  root.querySelectorAll('details[data-lazy="fund"]').forEach(d => d.addEventListener('toggle', async () => { if (d.open && !FUND) { await loadFund(); renderSel(); } }));
}
function renderTray() {
  const lvl = state.level, n = state.sel[lvl].length;
  $('#tray').hidden = !n;
  $('#trayText').textContent = `${n} ${n === 1 ? LEVELS[lvl].name.replace('City Council District', 'City Council district') : LEVELS[lvl].plural} picked`;
  $('#trayCompare').textContent = NARROW() ? (n > 1 ? `Compare ${n}` : 'Every number') : (n > 1 ? 'Compare in a table' : 'See every number');
}
const ACTIONS = {compare:openCompare, download:() => exportComparison(), zoom:zoomToSel, clear:clearSel};
$('#trayCompare').addEventListener('click', openCompare);
$('#trayDownload').addEventListener('click', () => exportComparison());
$('#trayClear').addEventListener('click', clearSel);
async function goTo(lvl, id) {
  if (state.level !== lvl) await setLevel(lvl);
  if (!state.sel[lvl].includes(id)) addMany([id]);
  const l = layerById.get(id); if (l) map.flyToBounds(l.getBounds(), {padding:[40, 40], maxZoom:16, duration:.6});
}

// funding list dialog
let listRows = [], listName = '';
async function openFundList(d) {
  await loadFund();
  const f = FUND.cc[String(d)]; if (!f) return;
  const rep = REPS.cc[String(d)];
  $('#listTitle').textContent = `Council District ${d}: ${fmt(f.n)} discretionary grants, fiscal year 2027`;
  listRows = f.rows; listName = `nyc_council_district_${d}_discretionary_fy2027.csv`;
  $('#listNote').textContent = `${money(f.total)} total${rep && !rep.vacant ? `, designated by ${rep.name}` : ''}. Source: NYC Council funding disclosure as of ${FUND.as_of}.`;
  $('#listQ').value = ''; renderList(); $('#listDlg').showModal();
}
function renderList() {
  const q = $('#listQ').value.trim().toLowerCase();
  const rows = listRows.filter(r => !q || r.join(' ').toLowerCase().includes(q));
  $('#listBody').innerHTML = `<div class="tablewrap"><table class="list"><thead><tr><th>Organization</th><th>Amount</th><th>Program</th><th>Agency</th><th>Status</th><th>Purpose</th></tr></thead><tbody>${rows.slice(0, 600).map(r => `<tr><td>${esc(r[0])}<div class="caption">${esc(r[5])}</div></td><td>${usd(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${esc(r[4])}</td><td class="wrap">${esc(r[6])}</td></tr>`).join('')}</tbody></table></div>${rows.length > 600 ? `<p class="caption">Showing 600 of ${rows.length}. Download for all.</p>` : ''}`;
}
$('#listQ').addEventListener('input', renderList);
$('#listDl').addEventListener('click', () => saveCsv(listName, [['organization','amount','program','agency','status','address','purpose'], ...listRows]));

// ---------- comparison dialog ----------
function overlapHTML(lvl, u, other, id) {
  const m = new Map(); let tot = 0;
  if (lvl === 'tract' && id) { for (const [ed, wp] of TPIECES.get(id) || []) { const k = EDM[ed] && EDM[ed][other]; if (k == null) continue; m.set(k, (m.get(k) || 0) + wp); tot += wp; } }
  else for (const ed of u.eds) { const k = EDM[ed] && EDM[ed][other]; if (k == null) continue; const v = EDV[ed][6]; m.set(k, (m.get(k) || 0) + v); tot += v; }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `<b>${esc(k)}</b> ${!tot ? 0 : v / tot < .005 ? '<1' : Math.round(v / tot * 100)}%`).join(', ');
}
const openGroups = new Set(['Voters by party', 'At a glance', 'Key numbers', 'Representatives', 'Donations']);
function renderCompare() {
  const lvl = state.level, ids = state.sel[lvl], st = state.status, o = st * 7;
  $('#cmpTitle').textContent = ids.length > 1 ? `Comparing ${ids.length} ${LEVELS[lvl].plural}` : ids.length ? unitLong(lvl, ids[0]) : 'Comparison';
  if (!ids.length) { $('#cmpBody').innerHTML = '<p class="caption">Nothing picked.</p>'; return; }
  const groups = [];
  const group = (title, rows) => rows && groups.push(`<tbody class="grp" data-g="${esc(title)}"><tr class="group"><td colspan="99"><button type="button" aria-expanded="${openGroups.has(title)}">${esc(title)}</button></td></tr></tbody><tbody ${openGroups.has(title) ? '' : 'hidden'} data-gb="${esc(title)}">${rows}</tbody>`);
  if (lvl === 'zip') {
    const all = ids.map(id => ({id, label:unitName(lvl, id), a:DON && DON.areas[id] || {}}));
    const row = (name, fn) => `<tr><td>${name}</td>` + all.map(c => `<td>${fn(c)}</td>`).join('') + '</tr>';
    const head = '<tr><th></th>' + all.map(c => `<th>${esc(c.label)}</th>`).join('') + '</tr>';
    group('Donations', row('Residents (est.)', c => fmt(DON.pop[c.id])) + row('2025 city races', c => money(c.a.cfb ? c.a.cfb.total : 0)) + row('City donors', c => fmt(c.a.cfb ? c.a.cfb.donors : 0))
      + row('City, per resident', c => c.a.cfb && DON.pop[c.id] ? '$' + (c.a.cfb.total / DON.pop[c.id]).toFixed(2) : '–') + row('Federal 2025–26', c => money(c.a.fec ? c.a.fec.total : 0)) + row('Federal donors', c => fmt(c.a.fec ? c.a.fec.donors : 0))
      + row('Federal to Democrats', c => money(c.a.fec && c.a.fec.by_party.Democratic || 0)) + row('Federal to Republicans', c => money(c.a.fec && c.a.fec.by_party.Republican || 0))
      + row('Top city recipient', c => c.a.cfb && c.a.cfb.top[0] ? esc(c.a.cfb.top[0][0]) : '–') + row('Top federal recipient', c => c.a.fec && c.a.fec.top[0] ? esc(c.a.fec.top[0][0]) : '–'));
    $('#cmpBody').innerHTML = `<div class="tablewrap"><table><thead>${head}</thead>${groups.join('')}</table></div>`;
    wireGroups(); $('#cmpNote').textContent = 'By donor ZIP code.'; $('#exEds').hidden = true; $('#exAll').textContent = 'Download all ZIP code areas';
    return;
  }
  const columns = ids.map(id => ({id, label:unitName(lvl, id), u:AGG[lvl].get(id), v:AGG[lvl].get(id).v, ctx:unitCtx(lvl, id)}));
  if (ids.length > 1) { const {v, ctx} = combined(lvl, ids); columns.push({label:'All together', v, u:{eds:ids.flatMap(id => AGG[lvl].get(id).eds)}, ctx, combined:true, ids}); }
  const city = {label:'All of NYC', v:CITY, ref:true, u:{eds:[]}, ctx:cityCtx(), id:'__city'};
  const all = [...columns, city];
  const bars = all.map(c => `<div class="cmp-bar ${c.ref ? 'ref' : ''}"><div class="nm">${esc(c.label)}</div>${pbar(c.v, st)}<div class="tot">${fmt(c.v[o + 6])}</div></div>`).join('');
  const legendRow = '<div class="plegend">' + PARTIES.map(p => `<span><i style="background:${PCOL[p]}"></i>${PNAME[p]}</span>`).join('') + '</div>';
  const head = `<tr><th>${['All voters', 'Active voters', 'Inactive voters'][st]}${lvl === 'tract' ? ' (est.)' : ''}</th>` + all.map(c => `<th class="${c.ref ? 'ref' : ''}">${esc(c.label)}</th>`).join('') + '</tr>';
  const row = (name, fn, cls = '') => `<tr><td>${name}</td>` + all.map(c => `<td class="${cls} ${c.ref ? 'ref' : ''}">${fn(c)}</td>`).join('') + '</tr>';
  // homes and conditions for a column (combined columns add their parts)
  const sumOf = (c, fn) => c.combined ? c.ids.reduce((s, id) => s + (fn(id) || 0), 0) : fn(c.id);
  if (['cc','ad','sd','cd'].includes(lvl) || lvl === 'ed') {
    const roles = lvl === 'ed' ? ['cc','ad','sd','cd'] : [lvl];
    group('Representatives', roles.map(k => row(ROLE[k], c => { if (c.ref || c.combined) return ''; const d = lvl === 'ed' ? EDM[c.id] && EDM[c.id][k] : c.id; const r = REPS[k] && REPS[k][String(d)]; return r ? esc(r.vacant ? 'Vacant' : r.name) : '–'; }, 'ov')).join(''));
  }
  let r = row('Total', c => `<b>${fmt(c.v[o + 6])}</b>`);
  PARTIES.forEach((p, i) => { r += row(PNAME[p], c => `${fmt(c.v[o + i])}<span class="pct">${pf(share(c.v, st, i))}</span>`); });
  group('Voters by party', r);
  r = row('Dem vs. Rep gap', c => gap(metricValue(c.v, 'margin', st))) + row('Inactive share', c => pf(c.v[6] ? c.v[20] / c.v[6] * 100 : null));
  if (lvl !== 'tract') r += row('Election districts', c => c.ref ? fmt(ED_WITH_VOTERS) : fmt(c.u.eds.length));
  group('At a glance', r);
  if (state.metric === 'r' && curC() && available() && !vintageMode()) {
    const cc = curC(), names = candOptions(cc).map(x => x[0]).slice(0, 8);
    const resOf = c => c.combined ? null : c.ref ? null : unitRes(lvl, c.id);
    let rr = names.map(nm => row(esc(nm), c => { const x = resOf(c); if (!x || !x.tot) return '–'; const it = x.items.find(i => i.name === nm); return it ? `${fmt(it.votes)}<span class="pct">${pf(it.votes / x.tot * 100)}</span>` : '–'; })).join('');
    rr += row('Ballots', c => { const x = resOf(c); return x ? fmt(x.b) : '–'; }) + row('Turnout', c => { const x = resOf(c); const t = x && turnoutOf(cc, lvl, c.id, x); return t != null ? pf(t) : '–'; });
    openGroups.add(`Election: ${cc.title}`);
    group(`Election: ${cc.title}`, rr);
  }
  for (const cat of CATS) {
    const items = catItems(cat.k);
    group(cat.k === 'key' ? 'Key numbers' : cat.label, items.map(i => row(esc(i.label), c => { const rv = ev(i, c.ctx); return `${fmtC(i, rv.x)}<span class="pct">${rv.moe != null ? fmtMoe(i, rv.moe) : ''}</span>${relSlot(rv.rel)}`; })).join(''));
  }
  const dOf = (c, k) => sumOf(c, id => { const a = doorsOf(lvl === 'ed' && id === '__city' ? 'cc' : lvl, id); return a ? a[DF[k]] : 0; });
  const dcity = c => c.ref ? DCITY : null;
  group('Homes', row('Homes', c => fmt(c.ref ? DCITY[DF.units] : dOf(c, 'units')))
    + row('Active voters per 100 homes', c => { const u = c.ref ? DCITY[DF.units] : dOf(c, 'units'); return u >= 20 ? (c.v[13] / u * 100).toFixed(0) : '–'; })
    + HOME_SEG.map(([k, l]) => row(`In ${l} unit buildings`.replace('1–2 units unit', '1–2 unit'), c => { const u = c.ref ? DCITY[DF.units] : dOf(c, 'units'); return u ? pf((c.ref ? DCITY[DF[k]] : dOf(c, k)) / u * 100) : '–'; })).join('')
    + row('In NYCHA', c => { const u = c.ref ? DCITY[DF.units] : dOf(c, 'units'); return u ? pf((c.ref ? DCITY[DF.nycha] : dOf(c, 'nycha')) / u * 100) : '–'; }));
  if (CAGG && lvl !== 'tract') {
    group('Conditions, per 1,000, July 2025 to June 2026', COND.map(k => row(esc(k.label) + (k.per === 'hu' ? ' <span class="caption">per 1,000 homes</span>' : ''), c => {
      const n = c.ref ? CAGG.city[CF[k.k]] : sumOf(c, id => condCount(k.k, lvl, id));
      const den = c.ref ? DCITY[k.per === 'hu' ? DF.hu20 : DF.pop20] : dOf(c, k.per === 'hu' ? 'hu20' : 'pop20');
      return den >= (k.per === 'hu' ? 100 : 200) ? `${(n / den * 1000).toFixed(1)}<span class="pct">${fmt(n)}</span>` : `–<span class="pct">${fmt(n)}</span>`;
    })).join(''));
  }
  if (lvl === 'cc' && FUND) group('Council discretionary funding, FY2027', row('Total designated', c => c.ref ? money(FUND.cc ? Object.values(FUND.cc).reduce((s, x) => s + x.total, 0) : null) : money(sumOf(c, id => FUND.cc[String(id)] ? FUND.cc[String(id)].total : 0))) + row('Grants', c => c.ref ? '' : fmt(sumOf(c, id => FUND.cc[String(id)] ? FUND.cc[String(id)].n : 0))));
  if (lvl === 'ed') group('Where it sits', ['cc','ad','sd','cd','boro'].map(k => row(k === 'boro' ? 'Borough' : LEVELS[k].name.replace(' District', ''), c => c.combined || c.ref ? '' : esc(EDM[c.id] && EDM[c.id][k] != null ? EDM[c.id][k] : '–'))).join('')
    + row('Election Day poll site', c => { if (c.combined || c.ref) return ''; const p = POLL_ED[String(c.id)]; return p && p[0] != null ? esc(SITES[p[0]][0]) : '–'; }, 'ov'));
  else group(lvl === 'tract' ? 'Overlaps (by 2020 residents)' : 'Shares area with (by voters)', ['cc','ad','sd','cd','boro'].filter(k => k !== lvl).map(k => row(k === 'boro' ? 'Borough' : LEVELS[k].short, c => c.ref || c.combined ? '' : overlapHTML(lvl, c.u, k, c.id), 'ov')).join(''));
  $('#cmpBody').innerHTML = `<div class="cmp-bars">${bars}</div>${legendRow}<div class="tablewrap"><table><thead>${head}</thead>${groups.join('')}</table></div>
    <p class="caption" style="margin-top:10px">Residents: U.S. Census Bureau, American Community Survey 2020–2024 and citizen voting-age tabulation. ${lvl === 'tract' ? 'Voter counts for tracts are estimated from overlapping election districts.' : 'Census numbers are split into districts by 2020 Census blocks.'} ± is the 90% margin of error. <i class="reldot rel-medium"></i> medium reliability, <i class="reldot rel-low"></i> low reliability. Homes: PLUTO 26v2. Conditions: NYC Open Data, with 2020 Census residents and homes as the base.</p>`;
  wireGroups();
  const parts = ids.map(id => [id, partial(lvl, id)]).filter(([, p]) => p);
  $('#cmpNote').textContent = parts.length ? parts.map(([id, p]) => `${unitName(lvl, id)} counts only its NYC part (${p.nyc_share}% of residents).`).join(' ') : 'Click a section name to open or close it.';
  $('#exAll').textContent = `Download all ${LEVELS[lvl].plural}`;
  $('#exEds').textContent = lvl === 'tract' ? 'Download tract and election district pieces' : 'Download election districts inside';
  $('#exEds').hidden = lvl === 'ed';
}
function wireGroups() {
  $$('#cmpBody .group button').forEach(b => b.addEventListener('click', () => {
    const g = b.closest('tbody').dataset.g, body = $(`#cmpBody tbody[data-gb="${CSS.escape(g)}"]`);
    body.hidden = !body.hidden; b.setAttribute('aria-expanded', !body.hidden); body.hidden ? openGroups.delete(g) : openGroups.add(g);
  }));
}
async function openCompare() { await Promise.all([loadConds().catch(() => null), state.level === 'cc' ? loadFund().catch(() => null) : null, state.level === 'zip' ? loadDon() : null]); renderCompare(); $('#cmpDlg').showModal(); }

// ---------- downloads ----------
const COLS21 = ['total','active','inactive'].flatMap(s => [...PARTIES, 'total'].map(p => `${p}_${s}`));
const csvEsc = x => { const s = x == null ? '' : String(x); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = rows => rows.map(r => r.map(csvEsc).join(',')).join('\r\n') + '\r\n';
const derived = v => [...PARTIES.map((p, i) => v[6] ? (v[i] / v[6] * 100).toFixed(2) : ''), v[6] ? ((v[0] - v[1]) / v[6] * 100).toFixed(2) : '', v[6] ? (v[20] / v[6] * 100).toFixed(2) : ''];
const DER_H = [...PARTIES.map(p => p + '_pct'), 'dem_minus_rep_pts', 'inactive_pct'];
const CEN_H = CI.flatMap(i => [i.col, i.col + '_moe', i.col + '_reliability']).concat(['share_of_residents_from_split_tracts', 'share_of_eligible_from_split_block_groups']);
const cenRow = ctx => CI.flatMap(i => { const r = ev(i, ctx); const nd = i.type === 'num' || i.type === 'usd' ? 0 : 1;
  return [r.x == null ? '' : r.x.toFixed(nd), r.moe == null ? '' : r.moe.toFixed(nd), r.rel]; }).concat([ctx.c ? ((ctx.split || 0) * 100).toFixed(1) : '', ctx.cvap ? ((ctx.cvap.split || 0) * 100).toFixed(1) : '']);
const HOME_H = ['homes','homes_1_2_units','homes_3_9_units','homes_10_49_units','homes_50plus_units','homes_nycha','residential_buildings','population_2020_census','housing_units_2020_census'];
const homeRow = a => a ? a.map(x => Math.round(x)) : HOME_H.map(() => '');
const COND_H = () => CONDS ? COND.flatMap(k => [k.k + '_count', k.k + '_per_1000']) : [];
const condRow = (lvl, id, counts, den) => CONDS ? COND.flatMap(k => {
  const n = counts ? counts[CF[k.k]] : condCount(k.k, lvl, id), d = den ? den[k.per === 'hu' ? DF.hu20 : DF.pop20] : condDen(k.k, lvl, id);
  return [n == null ? '' : n.toFixed(1), n != null && d >= (k.per === 'hu' ? 100 : 200) ? (n / d * 1000).toFixed(2) : ''];
}) : [];
const REP_H = lvl => lvl === 'ed' ? ['council_member','assembly_member','state_senator','member_of_congress'] : ['cc','ad','sd','cd'].includes(lvl) ? ['representative'] : [];
const repRow = (lvl, id) => (lvl === 'ed' ? ['cc','ad','sd','cd'] : ['cc','ad','sd','cd'].includes(lvl) ? [lvl] : []).map(k => { const d = lvl === 'ed' ? EDM[id] && EDM[id][k] : id; const r = REPS[k] && REPS[k][String(d)]; return r ? (r.vacant ? 'Vacant' : r.name) : ''; });
const FUND_H = lvl => lvl === 'cc' && FUND ? ['discretionary_fy2027_total','discretionary_fy2027_grants'] : [];
const fundRow = (lvl, id) => lvl === 'cc' && FUND ? (FUND.cc[String(id)] ? [FUND.cc[String(id)].total, FUND.cc[String(id)].n] : [0, 0]) : [];
const pollRow = id => { const p = POLL_ED[String(id)]; return p ? [p[0] != null ? SITES[p[0]][0] : '', p[0] != null ? `${SITES[p[0]][1]}, ${SITES[p[0]][2]}` : '', p[1] != null ? SITES[p[1]][0] : '', p[1] != null ? `${SITES[p[1]][1]}, ${SITES[p[1]][2]}` : ''] : ['', '', '', '']; };
const UNIT_H = lvl => ['district_type','district','name','election_districts',...COLS21,...DER_H,'nyc_share_of_residents_pct',...REP_H(lvl),...CEN_H,...HOME_H,...COND_H(),...FUND_H(lvl)];
const unitRow = (lvl, id) => { const u = AGG[lvl].get(id), p = partial(lvl, id);
  return [LEVELS[lvl].name, id, lvl === 'tract' ? unitLong(lvl, id) + (TINFO[id] && TINFO[id][0] ? ' (' + TINFO[id][0] + ')' : '') : unitName(lvl, id), lvl === 'tract' ? '' : u.eds.length,
    ...u.v.map(x => lvl === 'tract' ? x.toFixed(1) : x), ...derived(u.v), p ? p.nyc_share : (lvl === 'sd' || lvl === 'cd' ? 100 : ''), ...repRow(lvl, id), ...cenRow(unitCtx(lvl, id)),
    ...homeRow(doorsOf(lvl, id)), ...(lvl === 'tract' ? COND_H().map(() => '') : condRow(lvl, id)), ...fundRow(lvl, id)]; };
let dl = null;
async function saveCsv(name, rows) {
  const text = '﻿' + toCsv(rows);
  if (IN_PREVIEW) {
    try { dl = dl || await window.claude.use('downloads'); } catch (e) { dl = null; }
    if (dl) { try { await dl.save({filename:name, data:text}); toast(`Saved ${name}`); } catch (e) { if (e && e.code !== 'declined') toast('Download isn’t available here.'); } return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type:'text/csv;charset=utf-8'})); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Downloaded ${name}`);
}
const STAMP = 'feb2026_acs2024';
const ZIP_H = ['zip_area','zip_codes','residents_est','city_2025_total','city_2025_contributions','city_2025_donors','city_2025_small_gifts','federal_2025_26_total','federal_contributions','federal_donors','federal_to_democrats','federal_to_republicans'];
const zipRow = id => { const a = DON.areas[id] || {}, c = a.cfb || {}, f = a.fec || {}; return [id, DON.labels[id], DON.pop[id], c.total || 0, c.n || 0, c.donors || 0, c.small || 0, f.total || 0, f.n || 0, f.donors || 0, (f.by_party || {}).Democratic || 0, (f.by_party || {}).Republican || 0]; };
async function prepExport() { await Promise.all([loadConds().catch(() => null), state.level === 'cc' ? loadFund().catch(() => null) : null, state.level === 'zip' ? loadDon() : null]); }
async function exportComparison() {
  const lvl = state.level, ids = state.sel[lvl]; if (!ids.length) return;
  await prepExport();
  if (lvl === 'zip') return saveCsv('nyc_zip_donations_picked.csv', [ZIP_H, ...ids.map(zipRow)]);
  const rows = [UNIT_H(lvl), ...ids.map(id => unitRow(lvl, id))];
  if (ids.length > 1) {
    const {v, n, ctx} = combined(lvl, ids);
    const dsum = DOORS.fields.map((_, i) => ids.reduce((s, id) => s + ((doorsOf(lvl, id) || [])[i] || 0), 0));
    const csum = CONDS && lvl !== 'tract' ? CONDS.fields.map((_, i) => ids.reduce((s, id) => s + ((CAGG[lvl].get(id) || [])[i] || 0), 0)) : null;
    rows.push(['All picked together', ids.join(' + '), '', lvl === 'tract' ? '' : n, ...v.map(x => Math.round(x)), ...derived(v), '', ...REP_H(lvl).map(() => ''), ...cenRow(ctx), ...homeRow(dsum), ...(csum ? condRow(lvl, null, csum, dsum) : COND_H().map(() => '')), ...FUND_H(lvl).map(() => '')]);
  }
  rows.push(['All of NYC', 'NYC', '', ED_WITH_VOTERS, ...CITY, ...derived(CITY), '', ...REP_H(lvl).map(() => ''), ...cenRow(cityCtx()), ...homeRow(DCITY), ...(CONDS ? condRow(lvl, null, CAGG.city, DCITY) : []), ...FUND_H(lvl).map(() => '')]);
  saveCsv(`nyc_${LEVELS[lvl].file}_picked_${STAMP}.csv`, rows);
}
$('#exCmp').addEventListener('click', exportComparison);
$('#exEds').addEventListener('click', async () => {
  const lvl = state.level, ids = state.sel[lvl]; if (!ids.length) return;
  await prepExport();
  if (lvl === 'tract') {
    const rows = [['tract_geoid','tract','election_district','share_of_tract_residents_2020','share_of_ed_residents_2020','council_district','assembly_district','senate_district','congressional_district']];
    for (const t of ids) for (const [ed, wp, we] of TPIECES.get(t) || []) { const m = EDM[ed] || {}; rows.push([t, tractCode(t), ed, wp, we, m.cc, m.ad, m.sd, m.cd]); }
    return saveCsv(`nyc_tract_election_district_pieces_${STAMP}.csv`, rows);
  }
  const rows = [[`picked_${LEVELS[lvl].file}`, 'election_district', 'borough', 'council_district', 'assembly_district', 'senate_district', 'congressional_district', ...COLS21, ...DER_H, ...REP_H('ed'), 'election_day_poll_site', 'election_day_address', 'early_voting_site', 'early_voting_address', ...CEN_H, ...HOME_H, ...COND_H()]];
  for (const id of ids) for (const ed of AGG[lvl].get(id).eds) { const m = EDM[ed], v = EDV[ed]; rows.push([id, ed, m.boro, m.cc, m.ad, m.sd, m.cd, ...v, ...derived(v), ...repRow('ed', ed), ...pollRow(ed), ...cenRow(unitCtx('ed', ed)), ...homeRow(doorsOf('ed', ed)), ...condRow('ed', ed)]); }
  saveCsv(`nyc_election_districts_in_picked_${LEVELS[lvl].file}_${STAMP}.csv`, rows);
});
$('#exAll').addEventListener('click', async () => {
  const lvl = state.level;
  await prepExport();
  if (lvl === 'zip') return saveCsv('nyc_all_zip_donations.csv', [ZIP_H, ...sortIds('zip').map(zipRow)]);
  const ids = sortIds(lvl).filter(id => lvl !== 'ed' || AGG.ed.get(id).eds.length || cenUnit('ed', id));
  saveCsv(`nyc_all_${LEVELS[lvl].file}s_${STAMP}.csv`, [UNIT_H(lvl), ...ids.map(id => unitRow(lvl, id))]);
});
// results for the race on the map, at the current level
$('#resDl').addEventListener('click', () => {
  const c = curC(), E = curE(); if (!c) return;
  const lvl = state.level === 'tract' || state.level === 'zip' ? 'ed' : state.level;
  if (!resAvailable(c, lvl)) { toast(availText()); return; }
  const names = candOptions(c).map(x => x[0]);
  const ids = vintageMode() || lvl === 'ed' ? [...new Set(Object.keys(E.eds).map(Number))].sort((a, b) => a - b) : sortIds(lvl);
  const rows = [[lvl === 'ed' ? 'election_district' : LEVELS[lvl].name.toLowerCase().replace(/ /g, '_'), 'ballots', ...names.flatMap(n => [n, n + ' %']), 'turnout_pct', 'note']];
  for (const id of ids) {
    const r = unitRes(lvl, id); if (!r) continue;
    const t = turnoutOf(c, lvl, id, r);
    rows.push([id, r.b, ...names.flatMap(n => { const it = r.items.find(i => i.name === n); const v = it ? it.votes : 0; return [Math.round(v), r.tot ? (v / r.tot * 100).toFixed(2) : '']; }), t != null ? t.toFixed(2) : '', r.host ? `reported with ED ${r.host}` : r.partialCover ? 'only part of this district voted in this race' : '']);
  }
  saveCsv(`nyc_results_${state.res.e}_${slug(c.title)}${useFinal(c) ? '_final_round' : ''}_by_${lvl === 'ed' ? 'election_district_' + E.vintage : LEVELS[lvl].file}.csv`, rows);
});

// ---------- search: places ----------
const q = $('#q'), qList = $('#qList');
let qItems = [], qActive = -1, qAbort = null, qTimer = null;
const LEVEL_WORDS = [
  [/^(?:city\s*)?council(?:\s*district)?\s*#?\s*(\d{1,2})$|^cc\s*#?\s*(\d{1,2})$/i, 'cc'],
  [/^(?:state\s*)?assembly(?:\s*district)?\s*#?\s*(\d{1,2})$|^ad\s*#?\s*(\d{1,2})$/i, 'ad'],
  [/^(?:state\s*)?senate(?:\s*district)?\s*#?\s*(\d{1,2})$|^sd\s*#?\s*(\d{1,2})$/i, 'sd'],
  [/^congress(?:ional)?(?:\s*district)?\s*#?\s*(\d{1,2})$|^cd\s*#?\s*(\d{1,2})$|^ny\s*-?\s*(\d{1,2})$/i, 'cd'],
  [/^(?:ed|election\s*district)?\s*#?\s*([2-8]\d{4})$/i, 'ed']
];
function localMatches(text) {
  const t = text.trim(), out = [];
  for (const [re, lvl] of LEVEL_WORDS) {
    const m = t.match(re); if (!m) continue;
    const id = +(m[1] || m[2] || m[3]);
    if (AGG[lvl].has(id)) out.push({kind:LEVELS[lvl].short, label:unitLong(lvl, id), sub:`${fmt(AGG[lvl].get(id).v[6])} voters · ${subLine(lvl, id)}`, run:() => goTo(lvl, id)});
  }
  const zm = t.match(/^(?:zip\s*)?(1[01]\d{3})$/i);
  if (zm) { const a = zipArea(zm[1]); if (a) out.push({kind:'ZIP', label:`ZIP code ${zm[1]}`, sub:a !== zm[1] ? `Counted with ZIP area ${a}` : 'Political donations by donor ZIP', run:() => goTo('zip', a)}); }
  if (/^36\d{9}$/.test(t) && AGG.tract.has(t)) out.push({kind:'Tract', label:unitLong('tract', t), sub:(TINFO[t] && TINFO[t][0]) || '', run:() => goTo('tract', t)});
  if (/^\d{1,2}$/.test(t)) for (const lvl of ['cc','ad','sd','cd']) { const id = +t; if (AGG[lvl].has(id)) out.push({kind:LEVELS[lvl].short, label:unitLong(lvl, id), sub:`${fmt(AGG[lvl].get(id).v[6])} voters`, run:() => goTo(lvl, id)}); }
  if (t.length >= 3) for (const b of AGG.boro.keys()) if (b.toLowerCase().startsWith(t.toLowerCase())) out.push({kind:'Borough', label:b, sub:`${fmt(AGG.boro.get(b).v[6])} voters`, run:() => goTo('boro', b)});
  if (t.length >= 3 && !/^\d/.test(t)) for (const k of ['cc','ad','sd','cd']) for (const [d, r] of Object.entries(REPS[k])) if (!r.vacant && r.name.toLowerCase().includes(t.toLowerCase())) out.push({kind:'Rep', label:r.name, sub:`${ROLE[k]}, ${LEVELS[k].short} ${d}`, run:() => goTo(k, +d)});
  return out.slice(0, 7);
}
function renderSuggest(items, loading, note) {
  qItems = items; qActive = items.length ? 0 : -1;
  if (!q.value.trim()) { qList.hidden = true; q.setAttribute('aria-expanded', 'false'); return; }
  qList.innerHTML = items.map((it, i) => `<li role="option" id="qo${i}" aria-selected="${i === qActive}" data-i="${i}"><span class="kind">${esc(it.kind)}</span><span><span class="lab">${esc(it.label)}</span><br><span class="sub">${esc(it.sub || '')}</span></span></li>`).join('')
    + (loading ? '<li class="none">Looking up addresses…</li>' : note ? `<li class="none">${note}</li>` : (!items.length ? '<li class="none">No match. Try a street address, “Council 28”, “Assembly 32”, “23001” or a ZIP code.</li>' : ''));
  qList.hidden = false; q.setAttribute('aria-expanded', 'true');
  $$('#qList li[data-i]').forEach(li => li.addEventListener('mousedown', e => { e.preventDefault(); pick(+li.dataset.i); }));
}
function pick(i) { const it = qItems[i]; if (!it) return; qList.hidden = true; q.setAttribute('aria-expanded', 'false'); q.blur(); it.run(); }
q.addEventListener('input', () => {
  const text = q.value.trim(); clearTimeout(qTimer); if (qAbort) qAbort.abort();
  if (/^\d{5}$/.test(text) && !DON) loadDon().then(() => { if (q.value.trim() === text) q.dispatchEvent(new Event('input')); });
  const local = localMatches(text);
  if (text.length < 3 || /^\d{1,5}$/.test(text) || /^36\d{9}$/.test(text) || (local.length && !['Borough','Rep'].includes(local[0].kind))) { renderSuggest(local, false); return; }
  renderSuggest(local, true);
  qTimer = setTimeout(async () => {
    qAbort = new AbortController();
    try {
      const r = await fetch('https://geosearch.planninglabs.nyc/v2/autocomplete?text=' + encodeURIComponent(text), {signal:qAbort.signal});
      const d = await r.json();
      const addrs = (d.features || []).slice(0, 6).map(f => ({kind:'Address', label:f.properties.name,
        sub:[f.properties.neighbourhood || f.properties.locality, f.properties.borough, f.properties.postalcode].filter(Boolean).join(', '),
        run:() => gotoAddress(f.properties.label || f.properties.name, f.geometry.coordinates[1], f.geometry.coordinates[0], f.properties.postalcode)}));
      if (q.value.trim() === text) renderSuggest([...local, ...addrs], false);
    } catch (e) { if (e.name !== 'AbortError' && q.value.trim() === text) renderSuggest(local, false, IN_PREVIEW ? 'Address search works on the published site. Districts, ZIP codes and tract numbers work here.' : 'Address search isn’t responding. Try again in a moment.'); }
  }, 220);
});
q.addEventListener('keydown', e => {
  if (qList.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if (!qItems.length) return;
    qActive = (qActive + (e.key === 'ArrowDown' ? 1 : -1) + qItems.length) % qItems.length;
    $$('#qList li[data-i]').forEach((li, i) => li.setAttribute('aria-selected', i === qActive));
    q.setAttribute('aria-activedescendant', 'qo' + qActive);
  } else if (e.key === 'Enter') { e.preventDefault(); if (qActive >= 0) pick(qActive); }
  else if (e.key === 'Escape') { qList.hidden = true; }
});
q.addEventListener('blur', () => setTimeout(() => { qList.hidden = true; q.setAttribute('aria-expanded', 'false'); }, 120));
q.addEventListener('focus', () => { if (q.value.trim()) q.dispatchEvent(new Event('input')); });

const findIn = CityCore.findIn;
async function gotoAddress(label, lat, lng, zip) {
  const ed = findIn(FEAT.ed, lng, lat, f => f.properties.id), tract = findIn(FEAT.tract, lng, lat, f => f.properties.GEOID);
  if (zip) await loadDon().catch(() => null);
  state.addr = {label, ll:[lat, lng], ed, tract, zip: zip ? zipArea(zip) : null};
  q.value = label;
  const lvl = state.level;
  const id = lvl === 'tract' ? tract : lvl === 'zip' ? state.addr.zip : ed == null ? null : lvl === 'ed' ? ed : EDM[ed][lvl];
  if (id != null && !state.sel[lvl].includes(id) && !vintageMode()) addMany([id]);
  map.flyTo([lat, lng], Math.max(map.getZoom(), 15), {duration:.7});
  renderAddr(); renderLabels();
  $('#panel').scrollTo({top:0, behavior:'smooth'});
  if (NARROW()) toast('Your districts, representatives and poll site are below the map.');
}
function renderAddr() {
  const a = state.addr, el = $('#addrCard');
  if (!a) { el.hidden = true; return; }
  el.hidden = false;
  if (a.ed == null) {
    el.innerHTML = `<div class="addr"><div class="lab">${esc(a.label)}</div><p class="caption">This spot isn’t inside a mapped election district. It may be in a park, on the water, or outside the city.</p><div><button type="button" class="linkish" id="addrX">Clear address</button></div></div>`;
  } else {
    const m = EDM[a.ed];
    const chips = [['ed', a.ed], ['cc', m.cc], ['ad', m.ad], ['sd', m.sd], ['cd', m.cd], ['tract', a.tract], ['boro', m.boro], ['zip', a.zip]].filter(([, v]) => v != null)
      .map(([k, v]) => `<button type="button" class="chip" data-goto="${k}:${esc(v)}" aria-current="${k === state.level}">${esc(k === 'boro' ? v : unitName(k, v))}</button>`).join('');
    const reps = repList('ed', a.ed).map(x => repHTML(x, true)).join('');
    const city = (REPS.city || []).filter(c => c.area === 'Citywide' || c.area === m.boro).map(c => `<span><b>${esc(c.office)}</b> ${esc(c.name)}</span>`).join(' · ');
    el.innerHTML = `<div class="addr"><div class="row-between"><div class="lab">${esc(a.label)}</div><button type="button" class="linkish" id="addrX">Clear</button></div>
      <div class="addr-sec"><h3 class="mini">Where to vote · ${esc(POLLS.label)}</h3>${pollBlock(a.ed)}</div>
      <div class="addr-sec"><h3 class="mini">Your representatives</h3><div class="reps">${reps}</div>${city ? `<div class="member city-officials">${city}</div>` : ''}</div>
      <div class="addr-sec"><h3 class="mini">Your districts</h3><p class="caption">Tap one to see its full profile.</p><div class="chips">${chips}</div></div>
      <p class="caption">Right on a district line? Confirm at <a href="https://findmypollsite.vote.nyc/" target="_blank" rel="noopener">findmypollsite.vote.nyc</a>.</p></div>`;
    $$('#addrCard [data-goto]').forEach(b => b.addEventListener('click', () => { const [k, v] = b.dataset.goto.split(':'); goTo(k, ['boro','tract','zip'].includes(k) ? v : +v); }));
  }
  $('#addrX').addEventListener('click', () => { state.addr = null; q.value = ''; renderAddr(); renderLabels(); });
}

// ---------- search: layers ----------
const lq = $('#layerQ'), lList = $('#layerList');
let lItems = [], lActive = -1;
function layerCatalog() {
  const out = [];
  for (const m of METRICS) out.push({fam:'Voters', label:m.label, run:() => setMetric(m.k)});
  for (const i of CI) out.push({fam:'Residents', label:i.label, sub:CATS.find(c => c.k === i.cat) ? CATS.find(c => c.k === i.cat).label : '', run:() => { state.cat = i.cat; setMetric('c:' + i.k); }});
  for (const f of FIELD) out.push({fam:'Homes', label:f.label, run:() => setMetric('f:' + f.k)});
  for (const c of COND) out.push({fam:'Conditions', label:c.label, sub:c.g, run:() => setMetric('k:' + c.k)});
  for (const mm of MONEY) out.push({fam:'Money', label:mm.label, run:() => setMetric('m:' + mm.k)});
  return out;
}
const CATALOG = layerCatalog();
const words = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const SYN = {doors:'homes', door:'homes', canvass:'homes', housing:'homes nycha', crime:'crime felonies', rats:'rodents', heat:'heat', eviction:'evictions', money:'funding given', donors:'given', donations:'given', turnout:'turnout', citizens:'eligible citizens', immigrants:'born outside', latino:'hispanic', black:'black', asian:'asian', rent:'rent renters', income:'income', poverty:'poverty', seniors:'65', young:'18 to 29', language:'english', spanish:'spanish', chinese:'chinese', bengali:'bengali bangladeshi', noise:'noise', trash:'trash', parking:'parking', homeless:'homelessness'};
function layerMatches(text) {
  const t = words(text.trim()); if (t.length < 2) return [];
  const terms = t.split(/\s+/).flatMap(w => [w, ...(SYN[w] ? SYN[w].split(' ') : [])]);
  const score = s => { const w = words(s); return terms.reduce((n, x) => n + (w.includes(x) ? (w.startsWith(x) ? 3 : 2) : 0), 0); };
  const hits = CATALOG.map(it => [it, score(it.label + ' ' + (it.sub || '') + ' ' + it.fam)]).filter(([, s]) => s > 0);
  for (const [eid, cid, title, cands, ballots] of ELIX.contests) {
    const sTitle = score(title);
    const cand = cands.find(n => terms.some(x => x.length >= 3 && words(n).includes(x)));
    if (cand) hits.push([{fam:'Elections', label:`${cand} · ${title}`, sub:ELSHORT[eid], run:() => pickRace(eid, cid, 'share', cand), w:ballots}, 4 + Math.log10(ballots + 1)]);
    else if (sTitle > 0) hits.push([{fam:'Elections', label:title, sub:ELSHORT[eid], run:() => pickRace(eid, cid, 'lead'), w:ballots}, sTitle + Math.log10(ballots + 1) / 3]);
  }
  return hits.sort((a, b) => b[1] - a[1]).slice(0, 9).map(([it]) => it);
}
function renderLayerSuggest() {
  const items = layerMatches(lq.value); lItems = items; lActive = items.length ? 0 : -1;
  if (!lq.value.trim()) { lList.hidden = true; lq.setAttribute('aria-expanded', 'false'); return; }
  lList.innerHTML = items.map((it, i) => `<li role="option" id="lo${i}" aria-selected="${i === lActive}" data-i="${i}"><span class="kind">${esc(it.fam)}</span><span><span class="lab">${esc(it.label)}</span>${it.sub ? `<br><span class="sub">${esc(it.sub)}</span>` : ''}</span></li>`).join('') || '<li class="none">Nothing matches. Try a candidate, a group, or words like “evictions”, “renters”, “turnout”.</li>';
  lList.hidden = false; lq.setAttribute('aria-expanded', 'true');
  $$('#layerList li[data-i]').forEach(li => li.addEventListener('mousedown', e => { e.preventDefault(); lpick(+li.dataset.i); }));
}
function lpick(i) { const it = lItems[i]; if (!it) return; lList.hidden = true; lq.value = ''; lq.setAttribute('aria-expanded', 'false'); it.run(); }
lq.addEventListener('input', renderLayerSuggest);
lq.addEventListener('keydown', e => {
  if (lList.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!lItems.length) return; lActive = (lActive + (e.key === 'ArrowDown' ? 1 : -1) + lItems.length) % lItems.length; $$('#layerList li[data-i]').forEach((li, i) => li.setAttribute('aria-selected', i === lActive)); lq.setAttribute('aria-activedescendant', 'lo' + lActive); }
  else if (e.key === 'Enter') { e.preventDefault(); if (lActive >= 0) lpick(lActive); }
  else if (e.key === 'Escape') lList.hidden = true;
});
lq.addEventListener('blur', () => setTimeout(() => { lList.hidden = true; lq.setAttribute('aria-expanded', 'false'); }, 120));

// ---------- controls ----------
let levelBusy = null;
async function setLevel(l) {
  if (l === 'zip' && !FEAT.zip) {
    $('#levelCaption').textContent = 'Loading ZIP code areas…';
    try { const [t] = await Promise.all([load('zips.topo.json'), loadDon()]); FEAT.zip = topojson.feature(t, t.objects[Object.keys(t.objects)[0]]).features; }
    catch (e) { toast('ZIP code areas didn’t load. Try again.'); return; }
  }
  state.level = l;
  $$('#levelSeg button').forEach(b => b.setAttribute('aria-checked', b.dataset.l === l));
  $('#levelCaption').textContent = LEVELS[l].caption;
  $('#edFilter').hidden = l !== 'ed';
  $('#addBox').placeholder = l === 'ed' ? '23001, 23005-23010' : l === 'boro' ? 'Queens, Bronx' : l === 'tract' ? '36081044601' : l === 'zip' ? '10025, 11201' : '28, 29, 32';
  $('#addMsg').textContent = '';
  if (state.metric === 'r') { await ensureResults(); renderElec(); }
  buildFill(); renderSel(); renderTray(); writeHash(); updateResNote();
  if (state.addr) renderAddr();
}
$$('#levelSeg button').forEach(b => b.addEventListener('click', () => setLevel(b.dataset.l)));

// tabs
const TAB_DEFAULT = {voters:'dem', residents:() => 'c:' + catItems(state.cat)[0].k, field:'f:units', conditions:'k:311_total', money:() => state.level === 'zip' ? 'm:cfb' : 'm:fund', elections:'r'};
function setTab(t, fromUser) {
  state.tab = t;
  $$('#colorTabs [role=tab]').forEach(b => { b.setAttribute('aria-selected', b.dataset.t === t); b.tabIndex = b.dataset.t === t ? 0 : -1; });
  const panels = {voters:'#voterPanel', elections:'#elecPanel', residents:'#resPanel', field:'#fieldPanel', conditions:'#condPanel', money:'#moneyPanel'};
  for (const [k, sel] of Object.entries(panels)) $(sel).hidden = k !== t;
  updateResNote();
  if (fromUser && famOf(state.metric) !== t) { const d = TAB_DEFAULT[t]; setMetric(typeof d === 'function' ? d() : d); }
}
$$('#colorTabs [role=tab]').forEach(b => {
  b.addEventListener('click', () => setTab(b.dataset.t, true));
  b.addEventListener('keydown', e => {
    if (!['ArrowRight','ArrowLeft','Home','End'].includes(e.key)) return;
    const tabs = $$('#colorTabs [role=tab]'), i = tabs.indexOf(b);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[j].focus(); setTab(tabs[j].dataset.t, true); e.preventDefault();
  });
});

// voters
$('#metricGrid').innerHTML = METRICS.map(m => `<button type="button" role="radio" class="metric" data-m="${m.k}">${m.dot ? `<span class="dot" style="background:${m.dot}"></span>` : `<span class="ramp" style="background:${m.ramp}"></span>`}<span>${m.label}</span></button>`).join('');
$$('#metricGrid .metric').forEach(b => b.addEventListener('click', () => setMetric(b.dataset.m)));
function setStatus(s) {
  state.status = s; $$('#statusSeg button').forEach(b => b.setAttribute('aria-checked', +b.dataset.s === s));
  if (fillLayer) { restyle(); renderSel(); writeHash(); if ($('#cmpDlg').open) renderCompare(); }
}
$$('#statusSeg button').forEach(b => b.addEventListener('click', () => setStatus(+b.dataset.s)));
$('#statusHelpBtn').addEventListener('click', e => { const h = $('#statusHelp'); h.hidden = !h.hidden; e.currentTarget.setAttribute('aria-expanded', !h.hidden); });

// residents
$('#catRow').innerHTML = CATS.map(c => `<button type="button" class="cat" data-c="${c.k}">${c.label}</button>`).join('');
const listBtn = (m, label, checked, extra = '', title = '') => `<button type="button" role="radio" class="cmetric" data-m="${m}" aria-checked="${checked}" ${title ? `title="${esc(title)}"` : ''}>${extra}<span>${esc(label)}</span></button>`;
function renderCatList() {
  $$('#catRow .cat').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === state.cat));
  $('#cMetricList').innerHTML = catItems(state.cat).map(i => listBtn('c:' + i.k, i.label, state.metric === 'c:' + i.k, i.race || i.evrace ? `<span class="dot" style="background:${i.race || i.evrace}"></span>` : '', i.desc)).join('');
  $$('#cMetricList .cmetric').forEach(b => b.addEventListener('click', () => setMetric(b.dataset.m)));
  const cur = isCensus(state.metric) ? CIK[cKey(state.metric)] : null;
  $('#cDesc').textContent = cur && cur.desc ? cur.desc : '';
}
$$('#catRow .cat').forEach(b => b.addEventListener('click', () => { state.cat = b.dataset.c; renderCatList(); }));
function updateResNote() {
  const n = $('#resNote'); if (!n) return;
  n.textContent = state.level === 'ed' ? 'Census numbers for a single election district are split from larger census tracts, so none rate high reliability. Pick several districts, or switch to a district view, for firmer numbers.'
    : state.level === 'tract' ? 'Tracts are the Census Bureau’s own areas, so nothing is split here. Small groups still carry wide margins of error.' : '';
  n.hidden = !n.textContent;
}
$('#fadeLow').addEventListener('change', e => { state.fade = e.target.checked; restyle(); });

// homes, conditions, money lists
function renderSideLists() {
  $('#fieldList').innerHTML = FIELD.map(f => listBtn('f:' + f.k, f.label, state.metric === 'f:' + f.k, '', f.desc)).join('');
  const cur = state.metric.startsWith('f:') ? FIELDK[state.metric.slice(2)] : null;
  $('#fieldDesc').textContent = cur ? cur.desc : '';
  let g = '', html = '';
  for (const c of COND) { if (c.g !== g) { g = c.g; html += `<div class="list-h">${esc(g)}</div>`; } html += listBtn('k:' + c.k, c.label, state.metric === 'k:' + c.k, '', c.desc || ''); }
  $('#condList').innerHTML = html;
  const cc = state.metric.startsWith('k:') ? CONDK[state.metric.slice(2)] : null;
  $('#condDesc').textContent = cc ? `${cc.desc ? cc.desc + ' ' : ''}${state.cmode === 'rate' ? `Shown per 1,000 ${cc.per === 'hu' ? 'homes (2020 Census housing units)' : 'residents (2020 Census)'}.` : 'Shown as a count over 12 months.'}` : '';
  $('#condSrc').textContent = 'NYC Open Data: 311 service requests, HPD violations, marshals’ evictions, NYPD complaints. July 1, 2025 to June 30, 2026.';
  $$('#cmodeSeg button').forEach(b => b.setAttribute('aria-checked', b.dataset.c === state.cmode));
  $('#moneyList').innerHTML = MONEY.map(m => listBtn('m:' + m.k, m.label, state.metric === 'm:' + m.k, `<span class="lv">${m.lv[0] === 'cc' ? 'Council' : 'ZIP'}</span>`, m.desc)).join('');
  const mm = state.metric.startsWith('m:') ? MONEYK[state.metric.slice(2)] : null;
  $('#moneyDesc').textContent = mm ? mm.desc : '';
  $('#moneySrc').textContent = mm && mm.k === 'fund' ? 'NYC Council expense funding disclosure, fiscal year 2027.' : 'NYC Campaign Finance Board (2025 contributions) and Federal Election Commission (2025–2026 individual contributions, file of Oct 18, 2026).';
  $$('#fieldList .cmetric, #condList .cmetric, #moneyList .cmetric').forEach(b => b.addEventListener('click', () => setMetric(b.dataset.m)));
}
$$('#cmodeSeg button').forEach(b => b.addEventListener('click', () => { state.cmode = b.dataset.c; renderSideLists(); restyle(); writeHash(); }));

// elections panel
$('#elecSeg').innerHTML = ELX.map(e => `<button type="button" role="radio" data-e="${e.id}">${esc(ELSHORT[e.id])}</button>`).join('');
$$('#elecSeg button').forEach(b => b.addEventListener('click', async () => { state.res.e = b.dataset.e; state.res.c = null; await ensureResults(); renderElec(); refreshAll(); }));
function contestGroups(E) {
  const top = [], dist = [], boro = [], party = [], judge = [], prop = [];
  for (const c of E.contests) {
    const p = prep(c), st = c.scope[0];
    if (p.proposal) prop.push(c);
    else if (st === 'party') party.push(c);
    else if (st === 'judicial' || /Judge|Justice|Surrogate/.test(c.office)) judge.push(c);
    else if (st === 'city') top.push(c);
    else if (st === 'boro') boro.push(c);
    else dist.push(c);
  }
  top.sort((a, b) => b.ballots - a.ballots);
  const ord = {cd:0, sd:1, ad:2, cc:3};
  dist.sort((a, b) => (a.party || '').localeCompare(b.party || '') || ord[a.scope[0]] - ord[b.scope[0]] || a.scope[1] - b.scope[1]);
  return [['Top of the ballot', top], ['Every district race at once', E.groups], ['Borough races', boro], ['District races', dist], ['Party positions', party], ['Judges', judge], ['Ballot proposals', prop]];
}
async function ensureResults() {
  const E = await loadElection(state.res.e);
  if (!state.res.c || !E.byId.get(state.res.c)) state.res.c = contestGroups(E)[0][1][0].id;
  const c = E.byId.get(state.res.c);
  if (!c.rcv) state.res.round = '1';
  const vs = viewsFor(c).map(v => v[0]);
  if (!vs.includes(state.res.v)) state.res.v = vs[0];
  const opts = candOptions(c).map(x => x[0]);
  if (!opts.includes(state.res.a)) state.res.a = opts[0];
  if (!opts.includes(state.res.b) || state.res.b === state.res.a) state.res.b = opts.find(x => x !== state.res.a) || null;
  if (state.level === 'ed' && !E.same_lines_as_map) await loadVintageFeat(state.res.e);
}
function renderElec() {
  $$('#elecSeg button').forEach(b => b.setAttribute('aria-checked', b.dataset.e === state.res.e));
  const E = curE(); if (!E) { $('#contestSel').innerHTML = '<option>Loading…</option>'; return; }
  $('#contestSel').innerHTML = contestGroups(E).filter(([, l]) => l.length).map(([g, l]) => `<optgroup label="${esc(g)}">${l.map(c => `<option value="${esc(c.id)}" ${c.id === state.res.c ? 'selected' : ''}>${esc(c.title.replace(/^(Democratic|Republican|Conservative|Working Families) Primary: /, c.group ? '$1: ' : ''))}</option>`).join('')}</optgroup>`).join('');
  const c = curC();
  $('#viewSeg').innerHTML = viewsFor(c).map(([k, l]) => `<button type="button" role="radio" data-v="${k}" aria-checked="${k === state.res.v}" ${k === 'turnout' && !turnoutOK(c, state.level) && !(c && (c.group || c.scope[0] === 'city') && E.id !== '2024-general' && E.id !== '2025-primary') ? 'disabled' : ''}>${l}</button>`).join('');
  $$('#viewSeg button').forEach(b => b.addEventListener('click', () => { state.res.v = b.dataset.v; renderElec(); refreshAll(); }));
  const opts = candOptions(c);
  const sel = (id, val, label) => `<label class="fieldset"><span class="field-label">${label}</span><select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  $('#viewOpts').innerHTML = state.res.v === 'share' && !(c && prep(c.group ? c.members[0] : c).proposal) ? sel('optA', state.res.a, c.group ? 'Party' : 'Candidate') : state.res.v === 'h2h' ? sel('optA', state.res.a, 'Candidate') + sel('optB', state.res.b, 'Against') : '';
  if ($('#optA')) $('#optA').addEventListener('change', e => { state.res.a = e.target.value; if (state.res.b === state.res.a) state.res.b = opts.map(x => x[0]).find(x => x !== state.res.a); renderElec(); refreshAll(); });
  if ($('#optB')) $('#optB').addEventListener('change', e => { state.res.b = e.target.value; refreshAll(); });
  if (c && prep(c.group ? c.members[0] : c).proposal && state.res.v === 'share') state.res.a = 'Yes';
  $('#roundSeg').hidden = !(c && c.rcv);
  $$('#roundSeg button').forEach(b => b.setAttribute('aria-checked', b.dataset.r === state.res.round));
  // contest summary
  let sum = '';
  if (c && !c.group) {
    const p = prep(c), tot = p.cands.reduce((s, x) => s + x.votes, 0) + (c.lines.includes('Scattered') ? 0 : 0);
    const all = c.lines.length;
    let items = p.cands.map(cd => ({name:cd.name, color:cd.color, votes:cd.votes}));
    let denom = Object.values(c.rows).reduce((s, r) => s + r.slice(1).reduce((a, b) => a + b, 0), 0);
    let label = c.vote_for > 1 ? `Vote for ${c.vote_for}. Shares are of all votes cast.` : '';
    if (useFinal(c)) { const fr = c.rcv.rounds[c.rcv.rounds.length - 1]; items = c.rcv.finalists.map(n => ({name:n, color:colorOfCand(c, n), votes:fr[n]})); denom = items.reduce((s, x) => s + x.votes, 0); label = `Final round after ${c.rcv.rounds.length - 1} rounds of counting. Shares are of ballots still counting.`; }
    sum = `<div class="cbars">${items.sort((a, b) => b.votes - a.votes).slice(0, 8).map(it => `<div class="cbar"><span class="cn">${esc(it.name)}</span><span class="ct"><i style="width:${(it.votes / denom * 100).toFixed(1)}%;background:${it.color}"></i></span><b>${pf(it.votes / denom * 100)}</b></div>`).join('')}</div>
      <p class="caption">${fmt(c.ballots)} ballots${c.scope[0] !== 'city' && c.scope_name ? ` in ${esc(c.scope_name)}` : ''}. ${label}</p>`;
  } else if (c && c.group) sum = `<p class="caption">${c.members.length} separate races. ${c.party ? 'Map each district’s winning margin, ballots or turnout.' : 'Shown by the winner’s party. Party share adds each party’s candidates together.'}</p>`;
  $('#contestSum').innerHTML = sum;
  const notes = [];
  if (!E.same_lines_as_map && state.level === 'ed') notes.push(`This election used the ${E.vintage.toUpperCase()} election district lines. By election district, the map shows those lines and picking is off. District totals use today’s Council, Assembly, Senate and Congressional lines, which were the same then.`);
  if (state.res.v === 'turnout') notes.push(E.id === '2025-general' ? 'Turnout compares ballots with registered voters in February 2026, three months after the election.' : E.id === '2026-primary' ? `Turnout compares ballots with ${c && c.party ? 'enrolled ' + c.party + 's' : 'registered voters'} in February 2026.` : 'Turnout isn’t shown for this election: the voter roll we have is from a different time.');
  if (Object.keys(E.combined).length && state.level === 'ed') notes.push(`${Object.keys(E.combined).length} small election districts were counted together with a neighbor for this election and show their host’s numbers.`);
  $('#elecNote').innerHTML = notes.map(esc).join(' ');
  $('#elecNote').hidden = !notes.length;
}
$('#contestSel').addEventListener('change', async e => { state.res.c = e.target.value; await ensureResults(); renderElec(); refreshAll(); });
$$('#roundSeg button').forEach(b => b.addEventListener('click', async () => { state.res.round = b.dataset.r; await ensureResults(); renderElec(); refreshAll(); }));
async function pickRace(eid, cid, view, cand) {
  state.res.e = eid; state.res.c = cid; state.res.v = view || 'lead'; if (cand) state.res.a = cand;
  const E = await loadElection(eid), c = E.byId.get(cid);
  if (c && c.rcv && cand && !c.rcv.finalists.includes(cand)) state.res.round = '1';
  if (c && c.scope[0] !== 'city' && ['cc','ad','sd','cd','boro'].includes(c.scope[0]) && state.level !== c.scope[0] && state.level !== 'ed') state.level = c.scope[0];
  await setMetric('r');
  if (c && c.scope[0] !== 'city' && c.scope[1] != null && AGG[c.scope[0]] && AGG[c.scope[0]].has(c.scope[1]) && state.level === c.scope[0]) { const l = layerById.get(c.scope[1]); if (l) map.flyToBounds(l.getBounds(), {padding:[40, 40], maxZoom:15, duration:.6}); }
}
function refreshAll() {
  const vmWas = fillLayer && fillLayer._vm, vmNow = !!vintageMode();
  if (!fillLayer || vmWas !== vmNow) { buildFill(); fillLayer._vm = vmNow; } else restyle();
  renderSel(); writeHash(); if (hoverId != null) showHover(hoverId); if ($('#cmpDlg').open) renderCompare();
}
async function setMetric(k) {
  const f = famOf(k);
  if (f === 'conditions') await loadConds().catch(() => toast('Conditions data didn’t load.'));
  if (f === 'money') { if (k === 'm:fund') await loadFund().catch(() => null); else await loadDon().catch(() => null); }
  if (f === 'elections') await ensureResults();
  state.metric = k;
  // jump to a level where this layer exists
  const lv = levelsFor(k);
  if (!lv.includes(state.level)) { await setLevelQuiet(lv[0]); }
  $$('#metricGrid .metric').forEach(b => b.setAttribute('aria-checked', b.dataset.m === k));
  renderCatList(); renderSideLists(); if (f === 'elections') renderElec();
  setTab(f);
  refreshAll();
}
async function setLevelQuiet(l) {
  if (l === 'zip' && !FEAT.zip) { const [t] = await Promise.all([load('zips.topo.json'), loadDon()]); FEAT.zip = topojson.feature(t, t.objects[Object.keys(t.objects)[0]]).features; }
  state.level = l;
  $$('#levelSeg button').forEach(b => b.setAttribute('aria-checked', b.dataset.l === l));
  $('#levelCaption').textContent = LEVELS[l].caption;
  $('#edFilter').hidden = l !== 'ed';
  if (fillLayer) { map.removeLayer(fillLayer); fillLayer = null; }
  renderTray(); updateResNote();
}

// dialogs, share, toast
$$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
const openAbout = () => $('#aboutDlg').showModal();
$('#aboutBtn').addEventListener('click', openAbout);
$('#aboutBtn2').addEventListener('click', openAbout);
$('#reachList').innerHTML = ['sd','cd'].flatMap(k => Object.entries(reach[k]).filter(([, r]) => r.nyc_share < 100)
  .map(([id, r]) => `<li><b>${unitLong(k, id)}:</b> ${r.nyc_share}% of residents live in NYC. The rest are in ${esc(r.outside)}.</li>`)).join('');
let toastTimer;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2800); }
$('#shareBtn').addEventListener('click', async () => {
  writeHash();
  try { await navigator.clipboard.writeText(location.href); toast('Link copied. It opens this exact view.'); }
  catch (e) { toast('Copy the address bar to share this view.'); }
});
const onTheme = () => { setTiles(); restyle(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
new MutationObserver(onTheme).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
document.addEventListener('click', async e => {
  const a = e.target.closest('a[download]'); if (!a || !IN_PREVIEW) return;
  e.preventDefault();
  const name = a.getAttribute('href').split('/').pop();
  if (!/\.(zip|csv)$/.test(name)) { toast('The SQLite file downloads from the published site. The CSV bundle works here.'); return; }
  try { dl = dl || await window.claude.use('downloads'); if (!dl) throw 0; const blob = await (await fetch(a.getAttribute('href'))).blob(); await dl.save({filename:name, data:blob}); toast(`Saved ${name}`); }
  catch (err) { if (!err || err.code !== 'declined') toast('Download isn’t available here.'); }
});

// ---------- boot ----------
$('#loading').remove();
renderLineToggles();
for (const k of state.lines) setLine(k, true);
for (const k of state.polls) setPolls(k, true);
setStatus(state.status);
renderSideLists();
if (state.level === 'zip') await setLevelQuiet('zip');
await setMetric(validMetric(state.metric) ? state.metric : 'dem');
renderSel(); renderTray(); updateResNote();
if (state.sel[state.level].length) zoomToSel();
loadConds().then(() => { if (state.sel[state.level].length) renderSel(); }).catch(() => null);
})();
