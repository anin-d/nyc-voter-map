(async function () {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n == null || !isFinite(n) ? '–' : Math.round(n).toLocaleString('en-US');
const pf = (n, d = 1) => n == null || !isFinite(n) ? '–' : n.toFixed(d) + '%';
const usd = n => n == null || !isFinite(n) ? '–' : '$' + fmt(n);
const money = n => n == null || !isFinite(n) ? '–' : Math.abs(n) >= 1e6 ? '$' + (n / 1e6).toFixed(Math.abs(n) >= 1e7 ? 1 : 2) + 'M' : Math.abs(n) >= 1e4 ? '$' + Math.round(n / 1e3) + 'k' : '$' + fmt(n);
const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({1:'st', 2:'nd', 3:'rd'}[n % 10] || 'th'));
const IN_PREVIEW = !!(window.claude && typeof window.claude.use === 'function');
const NARROW = () => matchMedia('(max-width:860px)').matches;
const longDate = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', {month:'long', day:'numeric', year:'numeric'});
const monYr = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', {month:'short', year:'numeric'});

// ---------- vocabulary ----------
const PARTIES = ['dem','rep','con','wor','oth','blank'];
const PNAME = {dem:'Democrats', rep:'Republicans', con:'Conservatives', wor:'Working Families', oth:'Other parties', blank:'No party'};
const PCOL = {dem:'#2e5fae', rep:'#cc5446', con:'#e09030', wor:'#9b4a85', oth:'#529c5a', blank:'#9a92ad'};
const STATUS_WORD = ['voters', 'active voters', 'inactive voters'];
const LEVELS = {
  cc:{name:'City Council District', plural:'City Council districts', short:'Council', abbr:'CC', file:'council', by:'Council district'},
  ad:{name:'State Assembly District', plural:'State Assembly districts', short:'Assembly', abbr:'AD', file:'assembly', by:'Assembly district'},
  sd:{name:'State Senate District', plural:'State Senate districts', short:'Senate', abbr:'SD', file:'senate', by:'State Senate district'},
  cd:{name:'Congressional District', plural:'Congressional districts', short:'Congress', abbr:'CD', file:'congressional', by:'Congressional district'},
  ed:{name:'Election District', plural:'election districts', short:'ED', abbr:'ED', file:'election_district', by:'Election district'},
  tract:{name:'Census Tract', plural:'census tracts', short:'Tract', abbr:'CT', file:'census_tract', by:'Census tract'},
  boro:{name:'Borough', plural:'boroughs', short:'', abbr:'', file:'borough', by:'Borough'},
  zip:{name:'ZIP code area', plural:'ZIP code areas', short:'ZIP', abbr:'ZIP', file:'zip', by:'ZIP code'}
};
const LEVEL_ORDER = ['cc','ad','sd','cd','ed','tract','boro','zip'];
const ALL_LEVELS = ['cc','ad','sd','cd','ed','tract','boro'];
const FAMS = [
  {k:'voters', label:'Voters', sub:'Party enrollment, February 2026'},
  {k:'elections', label:'Elections', sub:'Results, 2024 to 2026'},
  {k:'residents', label:'People', sub:'Census: who lives here'},
  {k:'field', label:'Homes', sub:'Doors, buildings, public housing'},
  {k:'conditions', label:'Neighborhood', sub:'311, housing, evictions, crime'},
  {k:'money', label:'Money', sub:'Council funding and donations'}
];
const FAMK = Object.fromEntries(FAMS.map(f => [f.k, f]));
const METRICS = [
  {k:'dem', label:'Democrats', desc:'Share of registered voters enrolled as Democrats.'}, {k:'rep', label:'Republicans', desc:'Share enrolled as Republicans.'},
  {k:'blank', label:'No party', desc:'Share not enrolled in any party.'}, {k:'con', label:'Conservatives', desc:'Share enrolled in the Conservative Party.'},
  {k:'wor', label:'Working Families', desc:'Share enrolled in the Working Families Party.'}, {k:'oth', label:'Other parties', desc:'Share enrolled in any other party.'},
  {k:'margin', label:'Democrats minus Republicans', desc:'Democratic share minus Republican share, in points.'},
  {k:'total', label:'Registered voters', desc:'Number of registered voters.'},
  {k:'inactive', label:'Inactive voters', desc:'Share of registered voters the Board of Elections marks inactive, usually after mail comes back. They can still vote.'}
];
const METK = Object.fromEntries(METRICS.map(m => [m.k, m]));
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
  {k:'boro', label:'Boroughs', style:{color:'#1a1e23', weight:2.6, opacity:.9}, css:'border-top:3px solid'}
];
const CATS = [
  {k:'key', label:'Key numbers'}, {k:'people', label:'Age and citizenship'}, {k:'race', label:'Race and ethnicity'},
  {k:'origin', label:'Origins'}, {k:'lang', label:'Language and immigration'}, {k:'money', label:'Money and work'},
  {k:'housing', label:'Housing'}, {k:'edu', label:'Education and service'}
];
const KEY_SET = ['cvap','reg','hisp','nhblack','nhasian','nhwhite','med_inc','pov','renter','lep_hh','fborn','ba_plus','age65p','moved20'];
const FIELD = [
  {k:'units', label:'Homes', type:'num', desc:'Apartments and houses in the city’s tax lot file: the doors a canvass can knock.'},
  {k:'vph', label:'Active voters per 100 homes', type:'ratio', desc:'Active registered voters for every 100 homes. Higher means more voters behind each door.'},
  {k:'p1_2', label:'Homes in 1 or 2 unit houses', num:'u1_2', desc:'Share of homes in one- and two-family houses.'},
  {k:'p3_9', label:'Homes in 3 to 9 unit buildings', num:'u3_9', desc:'Share of homes in small buildings, mostly walk-ups and row houses.'},
  {k:'p10_49', label:'Homes in 10 to 49 unit buildings', num:'u10_49', desc:'Share of homes in mid-size apartment buildings.'},
  {k:'p50', label:'Homes in 50+ unit buildings', num:'u50', desc:'Share of homes in large buildings, which often need lobby access to reach.'},
  {k:'pnycha', label:'Homes in NYCHA public housing', num:'nycha', desc:'Share of homes in New York City Housing Authority developments.'}
];
const FIELDK = Object.fromEntries(FIELD.map(f => [f.k, f]));
const COND = [
  {k:'311_total', src:'311', g:'311 requests', label:'All 311 requests', per:'pop'},
  {k:'311_noise', src:'311', g:'311 requests', label:'Noise', per:'pop'},
  {k:'311_heat', src:'311', g:'311 requests', label:'No heat or hot water', per:'hu'},
  {k:'311_housing', src:'311', g:'311 requests', label:'Other apartment problems', per:'hu', desc:'Complaints the housing department handles besides heat: leaks, mold, pests, paint, plumbing, doors and more.'},
  {k:'311_rodent', src:'311', g:'311 requests', label:'Rodents', per:'pop'},
  {k:'311_trash', src:'311', g:'311 requests', label:'Trash and dirty streets', per:'pop', desc:'Dirty conditions, illegal dumping, missed collections, litter baskets, graffiti and dead animals.'},
  {k:'311_street', src:'311', g:'311 requests', label:'Streets, sidewalks and lights', per:'pop'},
  {k:'311_parking', src:'311', g:'311 requests', label:'Illegal parking and abandoned cars', per:'pop'},
  {k:'311_homeless', src:'311', g:'311 requests', label:'Homelessness and encampments', per:'pop'},
  {k:'hpd_total', src:'hpd', g:'Housing', label:'Housing code violations', per:'hu', desc:'Violations the housing department issued to buildings.'},
  {k:'hpd_c', src:'hpd', g:'Housing', label:'Immediately hazardous violations', per:'hu', desc:'Class C: conditions the city says must be fixed within 24 hours, like no heat, lead paint, broken locks or vermin.'},
  {k:'evict_evict', src:'evict', g:'Housing', label:'Evictions', per:'hu', desc:'Residential evictions carried out by city marshals.'},
  {k:'nypd_total', src:'nypd', g:'Crime', label:'All crime complaints', per:'pop', desc:'Felonies, misdemeanors and violations reported to the NYPD.'},
  {k:'nypd_felony', src:'nypd', g:'Crime', label:'Felonies', per:'pop'},
  {k:'nypd_violent', src:'nypd', g:'Crime', label:'Violent felonies', per:'pop', desc:'Murder, rape, robbery and felony assault.'},
  {k:'nypd_property', src:'nypd', g:'Crime', label:'Property felonies', per:'pop', desc:'Burglary, grand larceny and car theft.'},
  {k:'nypd_misdemeanor', src:'nypd', g:'Crime', label:'Misdemeanors', per:'pop'}
];
const CONDK = Object.fromEntries(COND.map(c => [c.k, c]));
const MONEY = [
  {k:'fund', label:'Council discretionary funding', lv:['cc'], type:'usd', desc:'Dollars each Council Member designated to local groups for fiscal year 2027 (July 2026 to June 2027).'},
  {k:'cfb', label:'Given to 2025 city candidates', lv:['zip'], type:'usd', desc:'Contributions from donors in each ZIP code to candidates for Mayor, Public Advocate, Comptroller, Borough President and City Council in 2025, net of refunds.'},
  {k:'cfb_pc', label:'City candidates, dollars per resident', lv:['zip'], type:'usd2', desc:'2025 city race contributions divided by the ZIP area’s residents.'},
  {k:'fec', label:'Given to federal campaigns and committees', lv:['zip'], type:'usd', desc:'Itemized contributions from donors in each ZIP code to federal candidates, parties and PACs in the 2025 to 2026 cycle.'},
  {k:'fec_pc', label:'Federal, dollars per resident', lv:['zip'], type:'usd2', desc:'Federal contributions divided by the ZIP area’s residents.'},
  {k:'fec_dem', label:'Federal party money: share to Democrats', lv:['zip'], type:'pct', desc:'Of federal money given to a party or its candidates, the share that went to Democrats rather than Republicans.'}
];
const MONEYK = Object.fromEntries(MONEY.map(m => [m.k, m]));
const ROLE = {cc:'Council Member', ad:'Assembly Member', sd:'State Senator', cd:'Member of Congress'};

// ---------- data: a small set at start, the rest on demand ----------
const lazy = {};
const load = f => lazy[f] || (lazy[f] = fetch('data/' + f).then(r => { if (!r.ok) throw new Error(f); return r.json(); }));
let topo, enroll, hoods, labels, reach, spec, REPS, ELIX;
try {
  [topo, enroll, hoods, labels, reach, spec, REPS, ELIX] = await Promise.all(
    ['nyc.topo.json','enroll.json','hoods.json','labels.json','reach.json','indicators.json','reps.json','results/elections.json'].map(load));
} catch (err) {
  $('#loading').textContent = 'The map data didn’t load. Check your connection and reload the page.';
  return;
}
const CI = spec.indicators, CIK = Object.fromEntries(CI.map(c => [c.k, c])), RACE = CI.filter(c => c.race);
const catItems = cat => cat === 'key' ? KEY_SET.map(k => CIK[k]).filter(Boolean) : CI.filter(c => c.cat === cat);
const EDV = enroll.ed;
const FEAT = {};
for (const k of ['ed','cc','ad','sd','cd','boro']) FEAT[k] = topojson.feature(topo, topo.objects[k]).features;
const EDM = {};
for (const f of FEAT.ed) { const p = f.properties; EDM[p.id] = {cc:p.cc, ad:p.ad, sd:p.sd, cd:p.cd, boro:p.boro}; }
if (!EDM[40047] && EDV['40047']) EDM[40047] = {cc:null, ad:40, sd:null, cd:null, boro:'Queens'};
const ZERO = new Array(21).fill(0);
const ED_WITH_VOTERS = Object.keys(EDV).length;
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
AGG.tract = new Map(); AGG.zip = new Map();
const CITY = new Array(21).fill(0);
for (const v of Object.values(EDV)) for (let i = 0; i < 21; i++) CITY[i] += v[i];

// census (2 files, 3 MB): loaded after the map is up, or right away when a census view is asked for
let model = null, cvapModel = null, F = {}, TINFO = {}, TPIECES = new Map(), CEN = null;
function loadCensus() {
  return CEN || (CEN = Promise.all([load('census.json'), load('cvap.json')]).then(([cen, cvap]) => {
    model = CityCore.init(cen, spec, EDM);
    cvapModel = CityCore.init(cvap, spec, EDM, {tractOf: a => a.slice(0, 11), popField: 'cvap'});
    F = model.F; TINFO = model.TINFO;
    for (const t of cen.tracts) AGG.tract.set(t, {id:t, v:new Array(21).fill(0), eds:[]});
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
    return true;
  }));
}
let TRACTS = null;
const loadTracts = () => TRACTS || (TRACTS = Promise.all([load('tracts.topo.json'), load('tract_labels.json'), loadCensus()]).then(([t, tl]) => {
  FEAT.tract = topojson.feature(t, t.objects[Object.keys(t.objects)[0]]).features; labels.tract = tl; return true; }));
let DOORS = null, DF = {}, DAGG = null, DCITY = null, DOORS_P = null;
const loadDoors = () => DOORS_P || (DOORS_P = load('doors.json').then(d => {
  DF = Object.fromEntries(d.fields.map((f, i) => [f, i]));
  DAGG = {ed:new Map(), tract:new Map(Object.entries(d.tract))};
  for (const k of ['cc','ad','sd','cd','boro']) DAGG[k] = new Map();
  DCITY = new Array(d.fields.length).fill(0);
  for (const [ed, a] of Object.entries(d.ed)) {
    DAGG.ed.set(+ed, a); for (let i = 0; i < a.length; i++) DCITY[i] += a[i];
    const m = EDM[ed]; if (!m) continue;
    for (const k of ['cc','ad','sd','cd','boro']) {
      const key = m[k]; if (key == null) continue;
      let s = DAGG[k].get(key); if (!s) DAGG[k].set(key, s = new Array(a.length).fill(0));
      for (let i = 0; i < a.length; i++) s[i] += a[i];
    }
  }
  DOORS = d; return d;
}));
const doorsOf = (lvl, id) => !DAGG ? null : id === '__city' ? DCITY : DAGG[lvl] ? DAGG[lvl].get(id) : null;
let POLLS = null, POLLS_P = null;
const loadPolls = () => POLLS_P || (POLLS_P = load('polls.json').then(d => (POLLS = d)));
let CONDS = null, CF = {}, CAGG = null, CONDS_P = null;
const loadConds = () => CONDS_P || (CONDS_P = Promise.all([load('conditions.json'), loadDoors()]).then(([d]) => {
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
  return (CONDS = d);
}));
let FUND = null, DON = null, FUND_P = null, DON_P = null;
const loadFund = () => FUND_P || (FUND_P = load('funding.json').then(d => (FUND = d)));
const loadDon = () => DON_P || (DON_P = Promise.all([load('donations.json'), load('zips.topo.json')]).then(([d, t]) => {
  DON = d; FEAT.zip = topojson.feature(t, t.objects[Object.keys(t.objects)[0]]).features;
  AGG.zip = new Map(Object.keys(labels.zip || {}).map(z => [z, {id:z, v:ZERO, eds:[]}]));
  return d;
}));
async function needLevel(l) { if (l === 'tract') await loadTracts(); if (l === 'zip') await loadDon(); }

const BOROFIPS = {'005':'Bronx','047':'Brooklyn','061':'Manhattan','081':'Queens','085':'Staten Island'};
const tractBoro = t => BOROFIPS[t.slice(2, 5)];
const tractCode = t => { const c = (TINFO[t] && TINFO[t][1]) || t.slice(5); const n = +c.slice(0, 4), s = c.slice(4); return s === '00' ? String(n) : `${n}.${s}`; };
const sortIds = lvl => [...AGG[lvl].keys()].sort((a, b) => typeof a === 'number' ? a - b : String(a).localeCompare(String(b)));
const partial = (lvl, id) => { const r = reach[lvl] && reach[lvl][id]; return r && r.nyc_share < 100 ? r : null; };
const unitName = (lvl, id) => lvl === 'boro' ? id : lvl === 'tract' ? `Tract ${tractCode(id)}` : lvl === 'zip' ? `ZIP ${id}` : `${LEVELS[lvl].short} ${id}`;
const unitLong = (lvl, id) => lvl === 'boro' ? id : lvl === 'tract' ? `Census Tract ${tractCode(id)}, ${tractBoro(id)}` : lvl === 'zip' ? `ZIP code area ${id}` : `${LEVELS[lvl].name} ${id}`;
const isId = (lvl, s) => ['boro','tract','zip'].includes(lvl) ? s : +s;

// ---------- numbers ----------
function metricValue(v, metric, st) {
  const o = st * 7, tot = v[o + 6];
  if (metric === 'total') return tot;
  if (metric === 'inactive') return v[6] ? v[20] / v[6] * 100 : null;
  if (!tot) return null;
  if (metric === 'margin') return (v[o] - v[o + 1]) / tot * 100;
  return v[o + PARTIES.indexOf(metric)] / tot * 100;
}
const ev = (ind, ctx) => !model || !ctx ? {x:null, moe:null, rel:''} : ind.src === 'cvap' ? CityCore.evaluate(cvapModel, ind, {...ctx, ...(ctx.cvap || {c:null, m:null, split:0})}) : CityCore.evaluate(model, ind, ctx);
const cval = (ind, ctx) => ev(ind, ctx).x;
const REL_TEXT = {medium:'Medium reliability: the margin of error is 15 to 30% of the estimate, or the area is mostly split from larger census tracts.', low:'Low reliability: the margin of error is large compared with the estimate. Treat as a rough sign only.'};
const relDot = rel => rel === 'medium' || rel === 'low' ? `<i class="reldot rel-${rel}" title="${REL_TEXT[rel]}"></i><span class="sr">${rel} reliability</span>` : '';
const fmtMoe = (ind, m) => m == null || !isFinite(m) ? '' : ind.type === 'num' ? '±' + fmt(m) : ind.type === 'usd' ? '±' + usd(Math.round(m / 100) * 100) : ind.type === 'reg' ? '±' + m.toFixed(0) : '±' + m.toFixed(1);
const fmtC = (ind, x) => x == null ? 'Too few residents' : ind.type === 'num' ? fmt(x) : ind.type === 'usd' ? (x === 200000 ? '$200,000+' : x >= 250001 ? '$250,000+' : usd(Math.round(x / 100) * 100)) : ind.type === 'reg' ? x.toFixed(0) : pf(x);
function unitCtx(lvl, id) {
  if (!model || lvl === 'zip') return null;
  const u = CityCore.unit(model, lvl, id), q = CityCore.unit(cvapModel, lvl, id);
  return {c:u ? u.c : null, m:u ? u.m : null, split:u ? u.split : 0, cvap:q ? {c:q.c, m:q.m, split:q.split} : null, v:AGG[lvl].get(id) ? AGG[lvl].get(id).v : null, tract: lvl === 'tract' ? id : null};
}
const cityCtx = () => model ? ({c:model.city.c, m:model.city.m, split:0, cvap:{c:cvapModel.city.c, m:cvapModel.city.m, split:0}, v:CITY}) : null;
const gap = x => x == null ? '–' : Math.abs(x) < .05 ? 'Even' : (x > 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1);
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
  const den = id === '__city' ? DCITY[CONDK[k].per === 'hu' ? DF.hu20 : DF.pop20] : condDen(k, lvl, id);
  return den >= (CONDK[k].per === 'hu' ? 100 : 200) ? n / den * 1000 : null;
}
const condWindow = src => { const s = CONDS && CONDS.sources[src]; return s ? `${monYr(s.start)} to ${monYr(s.end)}` : ''; };
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
  const first = String(n).split(' / ')[0].replace(/,?\s+(Jr|Sr|II|III|IV)\.?$/i, '').trim().split(/\s+/);
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
const curE = () => RES[state.res.e];
const curC = () => { const E = curE(); return E ? E.byId.get(state.res.c) : null; };
const useFinal = c => state.res.round === 'final' && c && c.rcv;
function resAvailable(c, lvl) {
  if (!c || lvl === 'tract' || lvl === 'zip') return false;
  if (c.group && c.party && lvl !== 'ed' && lvl !== c.scope[0]) return false;
  return true;
}
function unitRes(lvl, id, E = curE(), c = curC()) {
  if (!E || !c || !resAvailable(c, lvl)) return null;
  if (c.group) {
    const st = c.scope[0];
    const sid = lvl === st ? id : lvl === 'ed' ? (E.eds[String(id)] || [])[LIDX[st]] : null;
    if (sid != null) { const m = c.byScope.get(String(sid)); if (!m) return null; const r = single(E, m, lvl, id); if (r) r.contest = m; return r; }
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
function turnoutOK(c, lvl, E = curE()) {
  if (!E || !c) return false;
  if (E.id !== '2026-primary' && E.id !== '2025-general') return false;
  if (E.id === '2025-general' && lvl === 'ed') return false;
  if (useFinal(c)) return false;
  return c.group || c.scope[0] === 'city' || lvl === 'ed' || lvl === c.scope[0];
}
function turnoutOf(c, lvl, id, r, E = curE()) {
  if (!r || !turnoutOK(c, lvl, E)) return null;
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
  const r = unitRes(lvl, id); if (!r || (!r.tot && state.res.v !== 'ballots')) return null;
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
  const b = base || (THEME.dark ? '#1b1f23' : '#ffffff');
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
  if (c.group) return c.party ? [['winm','Winning margin'], ['ballots','Ballots'], ['turnout','Turnout']] : [['lead','Who won'], ['share','Party share'], ['winm','Margin'], ['ballots','Ballots'], ['turnout','Turnout']];
  const p = prep(c);
  if (p.proposal) return [['lead','Yes or no'], ['share','Yes share'], ['ballots','Ballots']];
  const v = [['lead','Who led'], ['share','Candidate']];
  if (p.cands.length > 1) v.push(['h2h','Head to head']);
  v.push(['turnout','Turnout'], ['ballots','Ballots']);
  if (c.rcv) v.push(['exhausted','Exhausted']);
  return v;
}
function candOptions(c) {
  if (!c) return [];
  if (c.group) { const s = new Set(); for (const m of c.members) for (const cd of prep(m).cands) s.add(cd.party || 'Other'); return [...s]; }
  if (useFinal(c)) return [...c.rcv.finalists];
  return prep(c).cands.map(cd => cd.name);
}
function colorOfCand(c, name) {
  if (!c) return TIE;
  if (c.group) return PARTY_COL[name] || TIE;
  const cd = prep(c).cands.find(x => x.name === name); return cd ? cd.color : TIE;
}
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
  const rank = c => { const o = c.office; return /^Mayor|President/.test(o) ? 0 : /Governor/.test(o) ? 1 : /United States Senator/.test(o) ? 2 : /Public Advocate/.test(o) ? 3 : /Comptroller/.test(o) ? 4 : /Attorney General/.test(o) ? 5 : 9; };
  top.sort((a, b) => rank(a) - rank(b) || b.ballots - a.ballots);
  const o = {cd:0, sd:1, ad:2, cc:3};
  dist.sort((a, b) => (a.party || '').localeCompare(b.party || '') || o[a.scope[0]] - o[b.scope[0]] || a.scope[1] - b.scope[1]);
  return [['Top of the ballot', top], ['Every district race at once', E.groups], ['Borough races', boro], ['District races', dist], ['Party positions', party], ['Judges', judge], ['Ballot proposals', prop]];
}

// ---------- state and links ----------
const state = {level:'cc', metric:'dem', status:0, cat:'key', fade:true, lines:new Set(['boro']), polls:new Set(),
  focus:null, cmp:{}, addr:null, cmode:'rate', tab:'overview', lastM:{},
  res:{e:'2025-general', c:null, v:'lead', a:null, b:null, round:'1'}};
for (const l of LEVEL_ORDER) state.cmp[l] = [];
const STATUS_KEYS = ['all','active','inactive'];
const famOf = m => m === 'r' ? 'elections' : m.startsWith('c:') ? 'residents' : m.startsWith('f:') ? 'field' : m.startsWith('k:') ? 'conditions' : m.startsWith('m:') ? 'money' : 'voters';
const validMetric = m => !!(METK[m] || (m.startsWith('c:') && CIK[m.slice(2)]) || (m.startsWith('f:') && FIELDK[m.slice(2)]) || (m.startsWith('k:') && CONDK[m.slice(2)]) || (m.startsWith('m:') && MONEYK[m.slice(2)]) || m === 'r');
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
  if (h.get('place')) { const [l, ...rest] = h.get('place').split(':'); if (LEVELS[l]) state.focus = {lvl:l, id:isId(l, rest.join(':'))}; }
  if (h.get('cmp')) state.cmp[state.level] = h.get('cmp').split(',').map(x => isId(state.level, decodeURIComponent(x))).slice(0, 40);
})();
function writeHash() {
  const p = new URLSearchParams();
  p.set('view', state.level); p.set('color', state.metric);
  if (famOf(state.metric) === 'voters' && state.status) p.set('voters', STATUS_KEYS[state.status]);
  if (state.metric === 'r') {
    p.set('e', state.res.e); if (state.res.c) p.set('race', state.res.c); p.set('show', state.res.v);
    if (state.res.a && ['share','h2h'].includes(state.res.v)) p.set('a', state.res.a);
    if (state.res.b && state.res.v === 'h2h') p.set('b', state.res.b);
    if (state.res.round === 'final') p.set('round', 'final');
  }
  if (famOf(state.metric) === 'conditions' && state.cmode === 'count') p.set('rate', 'count');
  p.set('lines', [...state.lines].join(','));
  if (state.polls.size) p.set('polls', [...state.polls].join(','));
  if (state.focus) p.set('place', `${state.focus.lvl}:${state.focus.id}`);
  if (state.cmp[state.level].length) p.set('cmp', state.cmp[state.level].join(','));
  try { history.replaceState(null, '', '#' + p.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')); } catch (e) {}
}

// ---------- what the map shows ----------
const available = () => levelsFor(state.metric).includes(state.level) && (state.metric !== 'r' || resAvailable(curC(), state.level));
const leadMode = () => state.metric === 'r' && state.res.v === 'lead';
function mapValue(lvl, id) {
  const m = state.metric, f = famOf(m);
  if (f === 'residents') return lvl === 'zip' ? null : cval(CIK[m.slice(2)], unitCtx(lvl, id));
  if (f === 'field') return fieldValue(m.slice(2), lvl, id);
  if (f === 'conditions') return condValue(m.slice(2), lvl, id);
  if (f === 'money') return moneyValue(m.slice(2), lvl, id);
  if (f === 'elections') return state.res.v === 'lead' ? null : resValue(lvl, id);
  const u = AGG[lvl] && AGG[lvl].get(id); return u ? metricValue(u.v, m, state.status) : null;
}
const h2hText = x => { if (x == null) return '–'; if (Math.abs(x) < .05) return 'Even'; return `${shortName(x > 0 ? state.res.a : state.res.b)} +${Math.abs(x).toFixed(1)}`; };
function fmtValue(x, short) {
  const m = state.metric, f = famOf(m);
  if (x == null) return '–';
  if (f === 'residents') { const ind = CIK[m.slice(2)]; return short ? (ind.type === 'num' ? fmt(x) : ind.type === 'usd' ? '$' + fmt(Math.round(x / 1000)) + 'k' : ind.type === 'reg' ? x.toFixed(0) : x.toFixed(1) + '%') : fmtC(ind, x); }
  if (f === 'field') { const k = m.slice(2); return k === 'units' ? fmt(x) : k === 'vph' ? x.toFixed(0) : x.toFixed(1) + '%'; }
  if (f === 'conditions') return state.cmode === 'count' ? fmt(x) : x >= 100 ? fmt(x) : x.toFixed(1);
  if (f === 'money') { const t = MONEYK[m.slice(2)].type; return t === 'pct' ? x.toFixed(1) + '%' : t === 'usd2' ? '$' + x.toFixed(2) : money(x); }
  if (f === 'elections') { const v = state.res.v; return v === 'ballots' ? fmt(x) : v === 'h2h' ? h2hText(x) : x.toFixed(1) + (v === 'winm' ? ' pts' : '%'); }
  if (m === 'total') return fmt(x);
  if (m === 'margin') return x === 0 ? '0' : gap(x);
  return x.toFixed(1) + '%';
}
function metricTitle(m = state.metric) {
  const f = famOf(m);
  if (f === 'residents') { const i = CIK[m.slice(2)]; return i.type || !i.den ? i.label : `${i.label}, share ${i.unit || 'of residents'}`; }
  if (f === 'field') return FIELDK[m.slice(2)].label;
  if (f === 'conditions') { const c = CONDK[m.slice(2)]; return state.cmode === 'count' ? `${c.label}, count` : `${c.label} per 1,000 ${c.per === 'hu' ? 'homes' : 'residents'}`; }
  if (f === 'money') return MONEYK[m.slice(2)].label;
  if (f === 'elections') {
    const c = curC(); if (!c) return 'Election results';
    const v = state.res.v, lab = {lead: c.group && !c.party ? 'Winning party' : 'Who led', share: c.group ? `${state.res.a} share` : `${shortName(state.res.a || '')} share`, h2h: `${shortName(state.res.a || '')} vs. ${shortName(state.res.b || '')}`, winm:'Winning margin', ballots:'Ballots cast', turnout:'Turnout', exhausted:'Exhausted ballots'}[v];
    return `${c.title.replace(/^(Democratic|Republican) Primary: /, '$1 primary: ')}: ${lab}`;
  }
  return m === 'total' ? 'Registered voters' : m === 'inactive' ? 'Inactive voters, share of voters' : m === 'margin' ? 'Democrats minus Republicans' : `${PNAME[m]}, share of voters`;
}
function metricDesc(m = state.metric) {
  const f = famOf(m);
  if (f === 'residents') return CIK[m.slice(2)].desc || '';
  if (f === 'field') return FIELDK[m.slice(2)].desc;
  if (f === 'conditions') { const c = CONDK[m.slice(2)]; return c.desc || ''; }
  if (f === 'money') return MONEYK[m.slice(2)].desc;
  if (f === 'voters') return METK[m].desc;
  return '';
}
function metricSrc(m = state.metric) {
  const f = famOf(m);
  if (f === 'voters') return 'NYS Board of Elections, registered voters as of February 20, 2026.';
  if (f === 'elections') return 'Certified results, NYC Board of Elections. Ranked-choice rounds counted from the Board’s cast vote records and checked against its certified reports.';
  if (f === 'residents') return CIK[m.slice(2)].src === 'cvap' ? 'U.S. Census Bureau, citizen voting-age population tabulation 2020 to 2024, split by 2020 Census blocks.' : 'U.S. Census Bureau, American Community Survey 2020 to 2024, split by 2020 Census blocks.';
  if (f === 'field') return 'NYC Planning PLUTO 26v2. Complexes split across their buildings; hotels, nursing homes, shelters and dorms left out.';
  if (f === 'conditions') { const c = CONDK[m.slice(2)]; const s = CONDS && CONDS.sources[c.src]; return s ? `NYC Open Data, ${s.label.toLowerCase()}, ${condWindow(c.src)}. Rates use 2020 Census ${c.per === 'hu' ? 'homes' : 'residents'}. Updated ${CONDS.updated.slice(0, 10)}.` : 'NYC Open Data.'; }
  if (f === 'money') return m === 'm:fund' ? 'NYC Council expense funding disclosure, fiscal year 2027.' : 'NYC Campaign Finance Board (2025) and Federal Election Commission (2025 and 2026, gifts over $200), by donor ZIP code.';
  return '';
}

// ---------- color scale (computed once per change, then read by every shape) ----------
const THEME = {};
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
function readTheme() { const cs = getComputedStyle(document.documentElement); for (const k of ['nodata','sel','accent','panel']) THEME[k] = cs.getPropertyValue('--' + k).trim(); THEME.dark = isDark(); THEME.edge = THEME.dark ? 'rgba(20,24,28,.6)' : 'rgba(255,255,255,.85)'; }
readTheme();
let breaks = [], cols = [], diverging = false;
const COLORS = new Map(), VALUES = new Map(), FADED = new Set();
let SORTED = [];
function seqFrom(hex) { return [.1, .22, .36, .52, .68, .84, 1].map(t => mix(hex, t, '#ffffff')); }
function paint() {
  COLORS.clear(); VALUES.clear(); FADED.clear(); diverging = false;
  const lvl = state.level, m = state.metric, f = famOf(m), ids = fillIds();
  if (!available()) { for (const id of ids) COLORS.set(id, THEME.nodata); SORTED = []; breaks = []; cols = []; return; }
  if (leadMode()) { for (const id of ids) COLORS.set(id, leadColor(lvl, id) || THEME.nodata); SORTED = []; return; }
  const RELS = new Map();
  if (f === 'residents') { const ind = CIK[m.slice(2)]; for (const id of ids) { const r = ev(ind, unitCtx(lvl, id)); VALUES.set(id, r.x); RELS.set(id, r.rel); } }
  else for (const id of ids) VALUES.set(id, mapValue(lvl, id));
  const vals = [...VALUES.values()].filter(x => x != null && isFinite(x) && (m !== 'total' || x > 0)).sort((a, b) => a - b);
  SORTED = vals.slice().reverse();
  if (m === 'margin') { breaks = MARGIN_BREAKS; cols = MARGIN_COLS; }
  else if (f === 'elections' && state.res.v === 'h2h') {
    const c = curC(), ca = colorOfCand(c, state.res.a), cb = colorOfCand(c, state.res.b);
    breaks = [-40, -20, -10, -2, 2, 10, 20, 40];
    cols = [1, .75, .5, .25].map(t => mix(cb, t, '#ffffff')).concat(['#efedf1'], [.25, .5, .75, 1].map(t => mix(ca, t, '#ffffff')));
    diverging = true;
  } else {
    cols = f === 'residents' ? (m === 'c:reg' ? PAL.reg : PAL.census) : f === 'field' ? PAL.field : f === 'conditions' ? PAL.cond : f === 'money' ? PAL.money
      : f === 'elections' ? (state.res.v === 'share' ? seqFrom(colorOfCand(curC(), state.res.a)) : state.res.v === 'turnout' ? PAL.turnout : PAL.neutral) : PAL[m];
    const n = cols.length; breaks = [];
    const ind = f === 'residents' ? CIK[m.slice(2)] : null;
    const nearZero = vals.filter(x => x < .5).length;
    if (ind && !ind.type && nearZero >= vals.length * .2 && vals.length - nearZero >= n) {
      const rest = vals.filter(x => x >= .5); breaks.push(.5);
      for (let i = 1; i < n - 1; i++) breaks.push(rest[Math.min(rest.length - 1, Math.floor(rest.length * i / (n - 1)))]);
    } else for (let i = 1; i < n; i++) breaks.push(vals[Math.min(vals.length - 1, Math.floor(vals.length * i / n))]);
    breaks = breaks.filter((b, i) => b != null && (i === 0 || b > breaks[i - 1]));
    if (breaks.length < n - 1) cols = cols.slice(n - 1 - breaks.length);
  }
  for (const id of ids) {
    const x = VALUES.get(id);
    if (x == null || (m === 'total' && x === 0)) { COLORS.set(id, THEME.nodata); continue; }
    let i = 0; while (i < breaks.length && x >= breaks[i]) i++;
    COLORS.set(id, cols[i]);
  }
  if (f === 'residents' && state.fade) for (const id of ids) if (VALUES.get(id) != null && RELS.get(id) === 'low') FADED.add(id);
}
function rankOf(x) {
  if (x == null || !SORTED.length) return null;
  let lo = 0, hi = SORTED.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (SORTED[mid] > x) lo = mid + 1; else hi = mid; }
  return {r:lo + 1, n:SORTED.length, pos:SORTED.length > 1 ? lo / (SORTED.length - 1) : 0};
}

// ---------- map ----------
const NYC = [[40.4961, -74.2556], [40.9155, -73.7000]];
const map = L.map('map', {preferCanvas:true, zoomSnap:1, zoomDelta:1, minZoom:9, maxZoom:18, boxZoom:false, zoomControl:false});
// keep what we zoom to clear of the floating cards
const pad = (maxZoom = 15) => NARROW() ? {padding:[24, 24], maxZoom} : {paddingTopLeft:[$('#layerCard').offsetWidth + 36, 24], paddingBottomRight:[($('#sheet').hidden ? 0 : $('#sheet').offsetWidth) + 36, 36], maxZoom};
const fitTo = (b, maxZoom, fly) => fly ? map.flyToBounds(b, Object.assign(pad(maxZoom), {duration:.6})) : map.fitBounds(b, pad(maxZoom));
fitTo(NYC, 12);
L.control.zoom({position:'bottomleft'}).addTo(map);
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
let baseTiles, labelTiles, tileFails = 0, tileOk = 0, hoodFallback = false;
function setTiles() {
  if (baseTiles) map.removeLayer(baseTiles);
  if (labelTiles) map.removeLayer(labelTiles);
  const d = THEME.dark, o = {maxNativeZoom:16, maxZoom:18};
  baseTiles = L.tileLayer(ESRI, Object.assign({style: d ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base',
    attribution:'Basemap: Esri, HERE, Garmin, © OpenStreetMap contributors · Data: NYS and NYC Boards of Elections, U.S. Census Bureau, NYC Open Data, NYC Planning, NYC CFB, FEC'}, o)).addTo(map);
  labelTiles = L.tileLayer(ESRI, Object.assign({style: d ? 'World_Dark_Gray_Reference' : 'World_Light_Gray_Reference', pane:'tilelabels'}, o)).addTo(map);
  for (const t of [baseTiles, labelTiles]) {
    t.on('tileload', () => { tileOk++; });
    t.on('tileerror', () => { if (++tileFails > 6 && tileOk === 0 && !hoodFallback) { hoodFallback = true; renderLabels(); } });
  }
}
setTiles();
const vintageMode = () => state.level === 'ed' && state.metric === 'r' && curE() && !curE().same_lines_as_map && RESF[state.res.e];
const fillFeatures = () => vintageMode() ? RESF[state.res.e] : FEAT[state.level] || [];
const featIdOf = f => state.level === 'ed' ? f.properties.id : state.level === 'tract' ? f.properties.GEOID : state.level === 'zip' ? f.properties.modzcta : f.properties[state.level];
const fillIds = () => vintageMode() ? RESF[state.res.e].map(f => f.properties.id) : [...(AGG[state.level] || new Map()).keys()];
let fillLayer = null, fillKey = ''; const layerById = new Map(); let hoverId = null;
const inCmp = id => state.cmp[state.level].includes(id);
const isFocus = id => state.focus && state.focus.lvl === state.level && state.focus.id === id;
function baseStyle(f) {
  const id = featIdOf(f), lvl = state.level, vm = vintageMode();
  const foc = !vm && isFocus(id), cmp = !vm && inCmp(id), fine = lvl === 'ed' || lvl === 'tract';
  return {renderer, fillColor:COLORS.get(id) || THEME.nodata, fillOpacity: FADED.has(id) ? .22 : .76,
    color: foc ? THEME.sel : cmp ? THEME.accent : THEME.edge, weight: foc ? 3.4 : cmp ? 2.6 : (fine ? .4 : 1.1), opacity:1};
}
function buildFill() {
  if (fillLayer) map.removeLayer(fillLayer);
  layerById.clear();
  const vm = vintageMode();
  fillKey = state.level + (vm ? ':' + state.res.e : '');
  fillLayer = L.geoJSON({type:'FeatureCollection', features:fillFeatures()}, {
    style: baseStyle,
    onEachFeature: (f, layer) => {
      const id = featIdOf(f);
      layerById.set(id, layer);
      layer.on('mouseover', e => { hoverId = id; layer.setStyle({weight:2.6, color:THEME.sel}); showTip(id, e); });
      layer.on('mousemove', e => moveTip(e));
      layer.on('mouseout', () => { if (hoverId === id) hoverId = null; layer.setStyle(baseStyle(f)); hideTip(); });
      layer.on('click', e => {
        if (vm) { L.popup({maxWidth:300}).setLatLng(e.latlng).setContent(`<div class="pop">${vintagePop(id)}</div>`).openOn(map); return; }
        const oe = e.originalEvent;
        if (oe.shiftKey || oe.metaKey || oe.ctrlKey) toggleCmp(id); else focusPlace(state.level, id, {fromMap:true});
      });
    }
  }).addTo(map);
  frontSel();
}
function restyle() { if (fillLayer) { fillLayer.eachLayer(l => l.setStyle(baseStyle(l.feature))); frontSel(); } }
function frontSel() { for (const id of [...state.cmp[state.level], state.focus && state.focus.lvl === state.level ? state.focus.id : null]) { const l = id != null && layerById.get(id); if (l) l.bringToFront(); } }
// one entry point for "the map should show the current state"
function refreshMap() {
  paint();
  const key = state.level + (vintageMode() ? ':' + state.res.e : '');
  if (!fillLayer || key !== fillKey) buildFill(); else restyle();
  renderLabels(); renderCard(); writeHash();
}

// tooltip near the cursor
const tip = $('#tip');
function tipText(id) {
  const lvl = state.level, vm = vintageMode();
  const name = vm ? `ED ${id}` : unitName(lvl, id);
  if (!available()) return `<b>${esc(name)}</b>`;
  if (leadMode()) { const r = unitRes(lvl, id); if (!r || !r.tot) return `<b>${esc(name)}</b><span class="v">Not on the ballot here</span>`; const [a, b] = r.items; return `<b>${esc(name)}</b><span class="v">${esc(a.short)} ${pf(a.votes / r.tot * 100)}${b ? ` · ${esc(b.short)} ${pf(b.votes / r.tot * 100)}` : ''}</span>`; }
  const x = VALUES.get(id);
  return `<b>${esc(name)}</b><span class="v">${x == null ? 'No data' : esc(fmtValue(x))}</span>${vm ? '<span class="h">Click for this district’s result</span>' : ''}`;
}
function showTip(id, e) { if (matchMedia('(hover: none)').matches) return; tip.innerHTML = tipText(id); tip.hidden = false; moveTip(e); }
function moveTip(e) { if (tip.hidden) return; const p = e.containerPoint, W = map.getSize(); const w = tip.offsetWidth, h = tip.offsetHeight; tip.style.left = (p.x + 14 + w > W.x ? p.x - w - 14 : p.x + 14) + 'px'; tip.style.top = (p.y + 14 + h > W.y ? p.y - h - 14 : p.y + 14) + 'px'; }
function hideTip() { tip.hidden = true; }
function vintagePop(id) {
  const r = unitRes('ed', id), c = curC();
  return `<div class="t">Election District ${id}</div><div class="caption">On the ${esc(curE().vintage.toUpperCase())} lines used in the ${esc(ELSHORT[state.res.e])}</div>${r ? resBars(r, 5) + `<div class="caption">${fmt(r.b)} ballots${r.host ? ` · counted with ED ${r.host}` : ''}</div>` : '<div class="caption">This race wasn’t on the ballot here.</div>'}`;
}

// boundary lines, poll sites, labels
const lineLayers = {};
const labelLayer = L.layerGroup().addTo(map);
async function setLine(k, on) {
  if (k === 'tract' && on) await loadTracts();
  const kind = LINE_KINDS.find(l => l.k === k);
  if (on && !lineLayers[k]) lineLayers[k] = L.geoJSON({type:'FeatureCollection', features:FEAT[k]}, {style: () => Object.assign({fill:false, interactive:false, renderer:ovRenderer, pane:'ov'}, kind.style), interactive:false}).addTo(map);
  else if (!on && lineLayers[k]) { map.removeLayer(lineLayers[k]); delete lineLayers[k]; }
}
const pollLayers = {};
const POLL_STYLE = {eday:{radius:5, color:'#ffffff', weight:1.5, fillColor:'#1a1e23', fillOpacity:1}, early:{radius:6.5, color:'#14625f', weight:2.5, fillColor:'#ffffff', fillOpacity:.95}};
async function setPolls(kind, on) {
  if (on && !pollLayers[kind]) {
    await loadPolls();
    const used = new Map();
    for (const [ed, pair] of Object.entries(POLLS.ed)) { const s = pair[kind === 'eday' ? 0 : 1]; if (s == null) continue; if (!used.has(s)) used.set(s, []); used.get(s).push(+ed); }
    const g = L.layerGroup();
    for (const [s, eds] of used) {
      const [name, addr, boro, lat, lon, approx] = POLLS.sites[s];
      const mk = L.circleMarker([lat, lon], Object.assign({renderer:ptsRenderer, pane:'pts'}, POLL_STYLE[kind]));
      mk.bindPopup(() => `<div class="pop"><div class="label">${kind === 'eday' ? 'Election Day poll site' : 'Early voting site'}</div><div class="t">${esc(name)}</div><div>${esc(addr)}, ${esc(boro)}</div>
        <div class="caption">${kind === 'eday' ? `Tuesday November 3, ${esc(POLLS.eday_hours)}. ` : 'October 24 to November 1. '}Serves ${eds.length} election district${eds.length === 1 ? '' : 's'}${eds.length <= 12 ? ': ' + eds.join(', ') : ''}.</div>
        ${approx ? '<div class="caption">Map point is approximate (within about a block).</div>' : ''}
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr + ', ' + boro + ', NY')}" target="_blank" rel="noopener">Directions</a></div>`, {maxWidth:280});
      g.addLayer(mk);
    }
    pollLayers[kind] = g.addTo(map);
  } else if (!on && pollLayers[kind]) { map.removeLayer(pollLayers[kind]); delete pollLayers[kind]; }
}
function renderLineToggles() {
  $('#lineToggles').innerHTML = LINE_KINDS.map(l => `<button type="button" class="tog" data-k="${l.k}" aria-pressed="${state.lines.has(l.k)}"><span class="ln" style="${l.css};color:${l.style.color === '#1a1e23' ? 'var(--fg)' : l.style.color}"></span>${l.label}</button>`).join('')
    + `<button type="button" class="tog" data-p="eday" aria-pressed="${state.polls.has('eday')}"><span class="pt pt-eday"></span>Election Day poll sites</button>`
    + `<button type="button" class="tog" data-p="early" aria-pressed="${state.polls.has('early')}"><span class="pt pt-early"></span>Early voting sites</button>`;
  $$('#lineToggles [data-k]').forEach(b => b.addEventListener('click', async () => {
    const k = b.dataset.k; state.lines.has(k) ? state.lines.delete(k) : state.lines.add(k);
    b.setAttribute('aria-pressed', state.lines.has(k)); await setLine(k, state.lines.has(k)); renderLabels(); writeHash();
  }));
  $$('#lineToggles [data-p]').forEach(b => b.addEventListener('click', async () => {
    const k = b.dataset.p; state.polls.has(k) ? state.polls.delete(k) : state.polls.add(k);
    b.setAttribute('aria-pressed', state.polls.has(k)); await setPolls(k, state.polls.has(k)); writeHash();
    if (state.polls.has(k) && map.getZoom() < 12) toast('Zoom in to tell the poll sites apart.');
  }));
}
function addLbl(lat, lng, html, cls) { labelLayer.addLayer(L.marker([lat, lng], {pane:'lbl', interactive:false, keyboard:false, icon:L.divIcon({className:'', html:`<div class="lbl ${cls}">${html}</div>`, iconSize:[0, 0]})})); }
function renderLabels() {
  labelLayer.clearLayers();
  const z = map.getZoom(), b = map.getBounds().pad(.1), lvl = state.level, vm = vintageMode();
  const special = new Set([...state.cmp[lvl], state.focus && state.focus.lvl === lvl ? state.focus.id : null].filter(x => x != null).map(String));
  const kinds = new Set([...state.lines].filter(k => !['boro','tract'].includes(k) && k !== lvl));
  const prefix = kinds.size > 0 || lvl === 'ed';
  for (const k of kinds) for (const [id, [lat, lng]] of Object.entries(labels[k])) if (b.contains([lat, lng])) addLbl(lat, lng, `${LEVELS[k].abbr} ${id}`, 'k-' + k);
  if (['cc','ad','sd','cd'].includes(lvl)) for (const [id, [lat, lng]] of Object.entries(labels[lvl])) if (!special.has(id) && b.contains([lat, lng])) addLbl(lat, lng, (prefix ? LEVELS[lvl].abbr + ' ' : '') + id, 'k-' + lvl);
  if (lvl === 'zip' && z >= 11 && labels.zip) for (const [id, [lat, lng]] of Object.entries(labels.zip)) if (!special.has(id) && b.contains([lat, lng])) addLbl(lat, lng, id, 'ed');
  if ((lvl === 'ed' || lvl === 'tract') && z >= 15 && !vm && labels[lvl]) {
    let n = 0;
    for (const [id, [lat, lng]] of Object.entries(labels[lvl])) {
      if (special.has(id) || !b.contains([lat, lng])) continue; if (++n > 450) break;
      addLbl(lat, lng, lvl === 'tract' ? tractCode(id) : (z >= 16 ? id : id.slice(2)), 'ed');
    }
  }
  if (hoodFallback && z >= 12 && !((lvl === 'ed' || lvl === 'tract') && z >= 15)) for (const [name, lat, lng] of hoods) if (b.contains([lat, lng])) addLbl(lat, lng, esc(name), 'hood');
  if (!vm) {
    for (const id of state.cmp[lvl]) { const p = labels[lvl] && labels[lvl][String(id)]; if (p && !(isFocus(id))) addLbl(p[0], p[1], esc(unitName(lvl, id)), 'cmp'); }
    if (state.focus && state.focus.lvl === lvl) { const p = labels[lvl] && labels[lvl][String(state.focus.id)]; if (p) addLbl(p[0], p[1], esc(unitName(lvl, state.focus.id)), 'sel'); }
  }
  if (state.addr && state.addr.ll) addLbl(state.addr.ll[0], state.addr.ll[1], '<span class="pin"></span>', '');
}
map.on('moveend', renderLabels);

// ---------- small renderers ----------
function pbar(v, st) {
  const o = st * 7, t = v[o + 6];
  if (!t) return '<div class="pbar"></div>';
  return '<div class="pbar" role="img" aria-label="' + PARTIES.map((p, i) => `${PNAME[p]} ${pf(v[o + i] / t * 100, 0)}`).join(', ') + '">' + PARTIES.map((p, i) => `<span style="width:${v[o + i] / t * 100}%;background:${PCOL[p]}"></span>`).join('') + '</div>';
}
const partyKeys = (v, st, list = PARTIES) => '<div class="keys">' + list.map(p => `<span><i style="background:${PCOL[p]}"></i>${PNAME[p]} <b>${pf(share(v, st, PARTIES.indexOf(p)), 0)}</b></span>`).join('') + '</div>';
function raceBar(c) {
  if (!c || !(c[F.pop] > 0)) return '';
  const t = c[F.pop];
  return '<div class="pbar" role="img" aria-label="' + RACE.map(r => `${r.label} ${pf(c[F[r.num]] / t * 100, 0)}`).join(', ') + '">' + RACE.map(r => `<span style="width:${c[F[r.num]] / t * 100}%;background:${r.race}"></span>`).join('') + '</div>'
    + '<div class="keys">' + RACE.map(r => `<span><i style="background:${r.race}"></i>${r.label === 'Hispanic or Latino' ? 'Hispanic' : r.label === 'Other or multiracial' ? 'Other' : r.label} <b>${pf(c[F[r.num]] / t * 100, 0)}</b></span>`).join('') + '</div>';
}
function topGroups(c, filt, n = 3) {
  if (!c || !(c[F.pop] > 0)) return [];
  return CI.filter(i => !i.src || i.src === 'acs').filter(filt).map(i => [i, cval(i, {c})]).filter(([, x]) => x != null && x >= 1).sort((a, b) => b[1] - a[1]).slice(0, n);
}
function resBars(r, max = 5) {
  if (!r || !r.tot) return '<p class="caption">No votes counted here.</p>';
  return '<div class="cbars">' + r.items.slice(0, max).map(it => `<div class="cbar"><span class="cn">${esc(it.name)}</span><span class="ct"><i style="width:${(it.votes / r.tot * 100).toFixed(1)}%;background:${it.color}"></i></span><b>${pf(it.votes / r.tot * 100)}</b></div>`).join('') + '</div>'
    + (r.items.length > max ? `<p class="caption">${r.items.length - max} more on the ballot</p>` : '');
}
const HOME_SEG = [['u1_2','1 or 2 units','#9fb7d4'], ['u3_9','3 to 9','#6b90bd'], ['u10_49','10 to 49','#3f6894'], ['u50','50+','#1f3d5f']];
function homesBar(a) {
  const t = a[DF.units]; if (!(t > 0)) return '';
  return '<div class="pbar" role="img" aria-label="' + HOME_SEG.map(([k, l]) => `${l} ${pf(a[DF[k]] / t * 100, 0)}`).join(', ') + '">' + HOME_SEG.map(([k, , c]) => `<span style="width:${a[DF[k]] / t * 100}%;background:${c}"></span>`).join('') + '</div>'
    + '<div class="keys">' + HOME_SEG.map(([k, l, c]) => `<span><i style="background:${c}"></i>${l}${k === 'u1_2' ? '' : ' units'} <b>${pf(a[DF[k]] / t * 100, 0)}</b></span>`).join('') + '</div>';
}
const legendTxt = () => {
  const fv = x => fmtValue(x, true), A = shortName(state.res.a || ''), B = shortName(state.res.b || ''), n = x => Math.abs(Math.round(x));
  return cols.map((c, i) => {
    const lo = i === 0 ? null : breaks[i - 1], hi = i < breaks.length ? breaks[i] : null;
    const t = diverging ? (lo == null ? `${B} by ${n(hi)}+` : hi == null ? `${A} by ${n(lo)}+` : lo < 0 && hi <= 0 ? `${B} by ${n(hi)} to ${n(lo)}` : lo >= 0 ? `${A} by ${n(lo)} to ${n(hi)}` : `Within ${n(hi)} points`)
      : lo == null ? `Under ${fv(hi)}` : hi == null ? `${fv(lo)} or more` : `${fv(lo)} to ${fv(hi)}`;
    return `<div class="row"><i style="background:${c}"></i><span>${t}</span></div>`;
  }).join('');
};

// ---------- the layer card ----------
function renderCard() {
  const m = state.metric, f = famOf(m);
  renderPicker();
  $('#layerTitle').textContent = metricTitle();
  // levels
  const lv = levelsFor(m), c = curC();
  $('#levelSel').innerHTML = LEVEL_ORDER.map(l => {
    const ok = lv.includes(l) && (m !== 'r' || resAvailable(c, l));
    return `<option value="${l}" ${l === state.level ? 'selected' : ''} ${ok ? '' : 'disabled'}>${LEVELS[l].by}${ok ? '' : l === 'zip' ? ' (donations only)' : ' (not for this)'}</option>`;
  }).join('');
  // controls
  const ctl = $('#layerControls');
  if (f === 'voters') ctl.innerHTML = `<div class="seg" role="radiogroup" aria-label="Which voters">${['All voters','Active','Inactive'].map((t, i) => `<button type="button" role="radio" data-s="${i}" aria-checked="${state.status === i}">${t}</button>`).join('')}</div>`;
  else if (f === 'elections') ctl.innerHTML = electionControls();
  else if (f === 'residents') ctl.innerHTML = `<label class="caption" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="fadeLow" ${state.fade ? 'checked' : ''}> Fade places where the number is unreliable</label>${state.level === 'ed' ? '<p class="note">Census numbers for one election district are split from larger tracts, so treat them as rough. Districts give firmer numbers.</p>' : ''}`;
  else if (f === 'conditions') ctl.innerHTML = `<div class="seg" role="radiogroup" aria-label="Rate or count"><button type="button" role="radio" data-c="rate" aria-checked="${state.cmode === 'rate'}">Rate per 1,000</button><button type="button" role="radio" data-c="count" aria-checked="${state.cmode === 'count'}">Count</button></div>`;
  else ctl.innerHTML = '';
  wireControls();
  // availability
  const un = $('#unavail');
  if (!available()) {
    let alt = lv.filter(l => l !== state.level && (m !== 'r' || resAvailable(c, l)));
    un.innerHTML = `<span>${esc(unavailText())}</span><div class="chips">${alt.slice(0, 4).map(l => `<button type="button" class="chip" data-lv="${l}">By ${esc(LEVELS[l].by.toLowerCase())}</button>`).join('')}</div>`;
    un.hidden = false; $$('#unavail [data-lv]').forEach(b => b.addEventListener('click', () => setLevel(b.dataset.lv)));
  } else un.hidden = true;
  // legend
  const lg = $('#legend');
  if (!available()) lg.innerHTML = '';
  else if (leadMode()) {
    const seen = new Map();
    for (const id of fillIds()) { const r = unitRes(state.level, id); if (r && r.tot && r.items[0].votes > 0) { const it = r.items[0]; if (!seen.has(it.name)) seen.set(it.name, [it, 0]); seen.get(it.name)[1]++; } }
    const list = [...seen.values()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    lg.innerHTML = list.map(([it, n]) => `<div class="row"><span class="tri"><i style="background:${mix(it.color, .42)}"></i><i style="background:${mix(it.color, .7)}"></i><i style="background:${it.color}"></i></span><span>${esc(it.short === it.name ? it.name : it.short)}</span><small>${n} won</small></div>`).join('')
      + `<div class="row"><i style="background:${THEME.nodata}"></i><span>Not on the ballot here</span></div><div class="lnote">Darker means a wider lead: under ${LEAD_BINS[0]}, ${LEAD_BINS[0]} to ${LEAD_BINS[1]}, over ${LEAD_BINS[1]} points.</div>`;
  } else {
    const none = f === 'residents' ? 'Too few residents' : f === 'conditions' ? (state.cmode === 'rate' ? 'Too few residents for a rate' : 'None') : f === 'elections' ? 'Not on the ballot here' : f === 'field' ? 'Too few homes' : f === 'money' ? 'No data' : 'No registered voters';
    lg.innerHTML = legendTxt() + `<div class="row"><i style="background:${THEME.nodata}"></i><span>${none}</span></div>`
      + (f === 'residents' && state.fade ? `<div class="row"><i style="background:${cols[Math.floor(cols.length / 2)] || '#ccc'};opacity:.3"></i><span>Faded: unreliable</span></div>` : '')
      + `<div class="lnote">${m === 'margin' ? 'D+20 means Democrats outnumber Republicans by 20 points.' : diverging ? 'Points ahead, as a share of all votes for the office.' : `Each color covers about the same number of ${LEVELS[state.level].plural}.`}</div>`;
  }
  $('#layerDesc').textContent = metricDesc();
  $('#layerSrc').textContent = metricSrc();
}
function unavailText() {
  const m = state.metric, lv = levelsFor(m);
  if (famOf(m) === 'elections') {
    const c = curC();
    if (c && (state.level === 'tract' || state.level === 'zip')) return 'Election results come by election district, which don’t fit inside census tracts or ZIP codes.';
    if (c && c.group && c.party) return `Each ${LEVELS[c.scope[0]].name.toLowerCase()} primary had its own candidates, so this works by ${LEVELS[c.scope[0]].name.toLowerCase()} or election district.`;
  }
  if (state.level === 'zip') return 'Only political donations are counted by ZIP code.';
  return `This is counted by ${lv.map(l => LEVELS[l].by.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' or $1')}.`;
}
const EL_CHIP = {'2024-general':'Nov 2024', '2025-primary':'June 2025', '2025-general':'Nov 2025', '2026-primary':'June 2026'};
const PARTY_SHORT = {Democratic:'Dem', Republican:'Rep', Conservative:'Con', 'Working Families':'WFP'};
const raceShort = c => { const t = c.title.replace('President/Vice President', 'President').replace(/^(Democratic|Republican|Conservative|Working Families) Primary: /, ''); return c.party ? `${PARTY_SHORT[c.party] || c.party} ${t.toLowerCase().startsWith('mayor') ? 'mayor' : t}` : t; };
function electionControls() {
  const E = curE(); if (!E) return '<p class="caption">Loading results</p>';
  const c = curC(), opts = candOptions(c), vs = viewsFor(c);
  const turnoutAny = c && (E.id === '2026-primary' || E.id === '2025-general') && !useFinal(c);
  let h = `<div class="seg" role="radiogroup" aria-label="What to show">${vs.map(([k, l]) => `<button type="button" role="radio" data-v="${k}" aria-checked="${k === state.res.v}" ${k === 'turnout' && !turnoutAny ? 'disabled title="Turnout needs a voter roll from the same time; shown for the June 2026 primary and the November 2025 general."' : ''}>${l}</button>`).join('')}</div>`;
  if (c && c.rcv) h += `<div class="seg" role="radiogroup" aria-label="Ranked-choice round"><button type="button" role="radio" data-r="1" aria-checked="${state.res.round !== 'final'}">First choices</button><button type="button" role="radio" data-r="final" aria-checked="${state.res.round === 'final'}">Final round</button></div>`;
  const sel = (id, val, lab) => `<label class="field-row"><span class="label">${lab}</span><select id="${id}">${opts.map(v => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
  const prop = c && !c.group && prep(c).proposal;
  if (state.res.v === 'share' && !prop) h += sel('optA', state.res.a, c && c.group ? 'Party' : 'Candidate');
  if (state.res.v === 'h2h') h += `<div class="two">${sel('optA', state.res.a, 'Candidate')}${sel('optB', state.res.b, 'Against')}</div>`;
  if (c && !c.group) {
    const p = prep(c);
    let items = p.cands.map(cd => ({name:cd.name, color:cd.color, votes:cd.votes})), denom = Object.values(c.rows).reduce((s, r) => s + r.slice(1).reduce((a, b) => a + b, 0), 0), note = c.vote_for > 1 ? ` Vote for ${c.vote_for}; shares are of all votes.` : '';
    if (useFinal(c)) { const fr = c.rcv.rounds[c.rcv.rounds.length - 1]; items = c.rcv.finalists.map(n => ({name:n, color:colorOfCand(c, n), votes:fr[n]})); denom = items.reduce((s, x) => s + x.votes, 0); note = ` Final round after ${c.rcv.rounds.length - 1} rounds; shares of ballots still counting.`; }
    items.sort((a, b) => b.votes - a.votes);
    h += `<div class="cbars">${items.slice(0, 4).map(it => `<div class="cbar"><span class="cn">${esc(it.name)}</span><span class="ct"><i style="width:${(it.votes / denom * 100).toFixed(1)}%;background:${it.color}"></i></span><b>${pf(it.votes / denom * 100)}</b></div>`).join('')}</div>
      <p class="caption">${fmt(c.ballots)} ballots${c.scope[0] !== 'city' && c.scope_name ? ` in ${esc(c.scope_name)}` : ' citywide'}.${note}</p>`;
  } else if (c && c.group) h += `<p class="caption">${c.members.length} separate races, each shown in its own district.</p>`;
  const notes = [];
  if (!E.same_lines_as_map && state.level === 'ed') notes.push(`This election used older election district lines (${E.vintage.toUpperCase()}), so the map shows those. Click one to see its result.`);
  if (state.res.v === 'turnout') notes.push(E.id === '2025-general' ? 'Turnout compares ballots with February 2026 registration, three months after the election.' : `Turnout compares ballots with ${c && c.party ? 'enrolled ' + c.party + 's' : 'registered voters'} in February 2026.`);
  if (notes.length) h += `<p class="note">${notes.map(esc).join(' ')}</p>`;
  h += '<div><button type="button" class="link" id="resDl">Download these results</button></div>';
  return h;
}
function wireControls() {
  $$('#layerControls [data-s]').forEach(b => b.addEventListener('click', () => { state.status = +b.dataset.s; refreshMap(); renderSheet(); }));
  $$('#layerControls [data-c]').forEach(b => b.addEventListener('click', () => { state.cmode = b.dataset.c; refreshMap(); }));
  const fl = $('#fadeLow'); if (fl) fl.addEventListener('change', e => { state.fade = e.target.checked; refreshMap(); });

  $$('#layerControls [data-v]').forEach(b => b.addEventListener('click', async () => { state.res.v = b.dataset.v; await ensureResults(); refreshMap(); }));
  $$('#layerControls [data-r]').forEach(b => b.addEventListener('click', async () => { state.res.round = b.dataset.r; await ensureResults(); refreshMap(); renderSheet(); }));
  const a = $('#optA'); if (a) a.addEventListener('change', e => { state.res.a = e.target.value; if (state.res.b === state.res.a) state.res.b = candOptions(curC()).find(x => x !== state.res.a); refreshMap(); });
  const b = $('#optB'); if (b) b.addEventListener('change', e => { state.res.b = e.target.value; refreshMap(); });
  const d = $('#resDl'); if (d) d.addEventListener('click', downloadResults);
}
async function ensureResults() {
  const E = await loadElection(state.res.e);
  if (!state.res.c || !E.byId.get(state.res.c)) state.res.c = contestGroups(E)[0][1][0].id;
  const c = E.byId.get(state.res.c);
  if (!c.rcv) state.res.round = '1';
  const vs = viewsFor(c).map(v => v[0]);
  if (!vs.includes(state.res.v)) state.res.v = vs[0];
  if (state.res.v === 'share' && prep(c.group ? c.members[0] : c).proposal) state.res.a = 'Yes';
  const opts = candOptions(c);
  if (!opts.includes(state.res.a)) state.res.a = opts[0];
  if (!opts.includes(state.res.b) || state.res.b === state.res.a) state.res.b = opts.find(x => x !== state.res.a) || null;
  if (state.level === 'ed' && !E.same_lines_as_map) await loadVintageFeat(state.res.e);
}
async function needMetric(m) {
  const f = famOf(m);
  if (f === 'residents') await loadCensus();
  if (f === 'field') await loadDoors();
  if (f === 'conditions') await loadConds();
  if (f === 'money') { if (m === 'm:fund') await loadFund(); else await loadDon(); }
  if (f === 'elections') await ensureResults();
}
async function setMetric(m) {
  $('#layerTitle').textContent = 'Loading';
  try { await needMetric(m); } catch (e) { toast('That data didn’t load. Try again.'); return; }
  state.metric = m; state.lastM[famOf(m)] = m;
  const lv = levelsFor(m);
  if (!lv.includes(state.level)) { state.level = lv[0]; await needLevel(state.level); }
  if (m === 'r') await ensureResults();
  refreshMap(); renderSheet();
}
async function setLevel(l) {
  try { await needLevel(l); } catch (e) { toast('That map didn’t load. Try again.'); return; }
  state.level = l;
  if (state.metric === 'r') await ensureResults();
  refreshMap(); renderTray();
  if (state.focus && state.focus.lvl !== l) {
    // keep the same place in view: the district at the new level that holds the focused place
    const nf = translateFocus(state.focus, l); if (nf != null) { state.focus = {lvl:l, id:nf}; restyle(); renderLabels(); }
  }
  renderSheet(); writeHash();
}
function translateFocus(fc, l) {
  if (state.addr && state.addr.ed != null) { const ed = state.addr.ed; return l === 'ed' ? ed : l === 'tract' ? state.addr.tract : l === 'zip' ? state.addr.zip : EDM[ed] ? EDM[ed][l] : null; }
  if (fc.lvl === 'ed' && EDM[fc.id] && ['cc','ad','sd','cd','boro'].includes(l)) return EDM[fc.id][l];
  return null;
}
$('#levelSel').addEventListener('change', e => setLevel(e.target.value));


// ---------- picking what the map shows: a topic, then a measure, one click each ----------
const PICKS = {
  voters: [['dem','Democrats'], ['rep','Republicans'], ['blank','No party'], ['margin','Dem minus Rep'], ['total','Registered'], ['inactive','Inactive']],
  residents: [['c:med_inc','Income'], ['c:reg','Voters per 100 eligible'], ['c:hisp','Hispanic'], ['c:nhblack','Black'], ['c:nhasian','Asian'], ['c:nhwhite','White'], ['c:fborn','Born abroad'], ['c:renter','Renters']],
  field: [['f:units','Homes'], ['f:vph','Voters per 100 homes'], ['f:p1_2','1 or 2 units'], ['f:p3_9','3 to 9 units'], ['f:p10_49','10 to 49 units'], ['f:p50','50+ units'], ['f:pnycha','NYCHA']],
  conditions: [['k:311_total','All 311'], ['k:311_noise','Noise'], ['k:311_heat','No heat'], ['k:311_rodent','Rodents'], ['k:hpd_total','Housing violations'], ['k:evict_evict','Evictions'], ['k:nypd_total','All crime'], ['k:nypd_violent','Violent crime']],
  money: [['m:fund','Council funding'], ['m:cfb','City donations'], ['m:cfb_pc','City, per resident'], ['m:fec','Federal donations'], ['m:fec_pc','Federal, per resident'], ['m:fec_dem','Federal to Democrats']]
};
const DEFAULT_OF = {voters:'dem', elections:'r', residents:'c:med_inc', field:'f:units', conditions:'k:311_total', money:'m:fund'};
const MORE = {
  voters: () => [['Party enrollment', METRICS.map(x => [x.k, x.label])]],
  residents: () => CATS.slice(1).map(c => [c.label, CI.filter(i => i.cat === c.k).map(i => ['c:' + i.k, i.label])]),
  conditions: () => ['311 requests', 'Housing', 'Crime'].map(g => [g, COND.filter(x => x.g === g).map(x => ['k:' + x.k, x.label])])
};
function renderPicker() {
  const m = state.metric, f = famOf(m);
  $('#topics').innerHTML = FAMS.map(x => `<button type="button" role="tab" data-fam="${x.k}" aria-selected="${x.k === f}" title="${esc(x.sub)}">${esc(x.label)}</button>`).join('');
  let h = '';
  if (PICKS[f]) {
    const picks = PICKS[f].filter(([k]) => validMetric(k)), inPicks = picks.some(([k]) => k === m);
    h = `<div class="chips">${picks.map(([k, l]) => `<button type="button" class="chip" data-m="${k}" aria-pressed="${k === m}">${esc(l)}</button>`).join('')}</div>`;
    if (MORE[f]) {
      const groups = MORE[f](), n = groups.reduce((t, [, l]) => t + l.length, 0);
      h += `<select class="more" id="moreSel" aria-label="Every ${esc(FAMK[f].label.toLowerCase())} measure"><option value="" ${inPicks ? 'selected' : ''}>All ${n} measures</option>${groups.map(([g, l]) => `<optgroup label="${esc(g)}">${l.map(([k, lab]) => `<option value="${k}" ${!inPicks && k === m ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</optgroup>`).join('')}</select>`;
    }
  }
  if (f === 'elections') h = electionPicks();
  $('#picks').innerHTML = h; $('#picks').hidden = !h;
}
function electionPicks() {
  const E = curE(); if (!E) return '';
  const top = (contestGroups(E)[0][1] || []).slice(0, 4);
  const raceOpts = contestGroups(E).filter(([, l]) => l.length).map(([g, l]) => `<optgroup label="${esc(g)}">${l.map(x => `<option value="${esc(x.id)}" ${x.id === state.res.c ? 'selected' : ''}>${esc(x.title.replace(/^(Democratic|Republican|Conservative|Working Families) Primary: /, '$1: '))}</option>`).join('')}</optgroup>`).join('');
  const n = contestGroups(E).reduce((t, [, l]) => t + l.length, 0);
  return `<div class="seg seg4" role="radiogroup" aria-label="Election">${ELX.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e => `<button type="button" role="radio" data-el="${e.id}" aria-checked="${e.id === state.res.e}">${esc(EL_CHIP[e.id] || ELSHORT[e.id])}</button>`).join('')}</div>
    <div class="chips" aria-label="Main races">${top.map(x => `<button type="button" class="chip" data-rc="${esc(x.id)}" aria-pressed="${x.id === state.res.c}">${esc(raceShort(x))}</button>`).join('')}</div>
    <select id="raceSel" class="more" aria-label="Every race in this election (${n})">${raceOpts}</select>`;
}
$('#topics').addEventListener('click', e => {
  const b = e.target.closest('[data-fam]'); if (!b || b.dataset.fam === famOf(state.metric)) return;
  $$('#topics [data-fam]').forEach(x => x.setAttribute('aria-selected', x === b));
  setMetric(state.lastM[b.dataset.fam] || DEFAULT_OF[b.dataset.fam]);
});
$('#picks').addEventListener('click', e => {
  const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === state.metric) return;
  $$('#picks [data-m]').forEach(x => x.setAttribute('aria-pressed', x === b));
  setMetric(b.dataset.m);
});
$('#picks').addEventListener('change', async e => {
  if (e.target.id === 'moreSel' && e.target.value) setMetric(e.target.value);
  if (e.target.id === 'raceSel') { state.res.c = e.target.value; await ensureResults(); refreshMap(); renderSheet(); }
});
$('#picks').addEventListener('click', async e => {
  const el = e.target.closest('[data-el]'), rc = e.target.closest('[data-rc]');
  if (el && el.dataset.el !== state.res.e) {
    $$('#picks [data-el]').forEach(x => x.setAttribute('aria-checked', x === el)); $('#layerTitle').textContent = 'Loading';
    state.res.e = el.dataset.el; state.res.c = null; await ensureResults(); refreshMap(); renderSheet();
  }
  if (rc && rc.dataset.rc !== state.res.c) {
    $$('#picks [data-rc]').forEach(x => x.setAttribute('aria-pressed', x === rc));
    state.res.c = rc.dataset.rc; await ensureResults(); refreshMap(); renderSheet();
  }
});
async function pickRace(eid, cid, view, cand) {
  state.res.e = eid; state.res.c = cid; state.res.v = view || 'lead'; if (cand) state.res.a = cand;
  const E = await loadElection(eid), c = E.byId.get(cid);
  if (c && c.rcv && cand && !c.rcv.finalists.includes(cand)) state.res.round = '1';
  if (c && c.scope[0] !== 'city' && ['cc','ad','sd','cd','boro'].includes(c.scope[0]) && state.level !== c.scope[0] && state.level !== 'ed') state.level = c.scope[0];
  await setMetric('r');
  if (c && c.scope[1] != null && state.level === c.scope[0]) { const l = layerById.get(c.scope[1]); if (l) fitTo(l.getBounds(), 15, true); }
}

// ---------- the place sheet ----------
const TABS = {overview:'Overview', voters:'Voters', elections:'Elections', people:'People', homes:'Homes', conditions:'Neighborhood', money:'Money'};
function tabsFor(lvl) {
  if (lvl === 'zip') return [];
  if (lvl === 'tract') return ['overview','voters','people','homes'];
  return ['overview','voters','elections','people','homes','conditions'].concat(lvl === 'cc' ? ['money'] : []);
}
async function focusPlace(lvl, id, opt = {}) {
  if (lvl !== state.level) await setLevel(lvl);
  state.focus = {lvl, id};
  if (!opt.keepTab) state.tab = 'overview';
  if (!opt.keepAddr && state.addr && !(state.addr.ed != null && translateFocus({lvl:'ed', id:state.addr.ed}, lvl) === id)) state.addr = null;
  restyle(); renderLabels(); renderSheet(); writeHash();
  if (opt.zoom) { const l = layerById.get(id); if (l) fitTo(l.getBounds(), 15, true); }
  if (opt.fromMap && NARROW()) toast(`${unitName(lvl, id)}: details are below the map.`);
}
function clearFocus() { state.focus = null; state.addr = null; restyle(); renderLabels(); renderSheet(); writeHash(); }
function toggleCmp(id) {
  const a = state.cmp[state.level], i = a.indexOf(id);
  if (i >= 0) a.splice(i, 1); else a.push(id);
  restyle(); renderLabels(); renderTray(); renderSheetHead(); writeHash();
}
let sheetToken = 0;
async function renderSheet() {
  const tok = ++sheetToken;
  renderAddr();
  const fc = state.focus;
  document.body.classList.toggle('has-place', !!(fc || state.addr));
  if (!fc || fc.lvl !== state.level || !AGG[fc.lvl] || !AGG[fc.lvl].has(fc.id)) {
    if (fc && fc.lvl === state.level && AGG[fc.lvl] && AGG[fc.lvl].size && !AGG[fc.lvl].has(fc.id)) state.focus = null;
    $('#sheetTabs').hidden = true; $('#sheetHead').innerHTML = ''; $('#sheetBody').innerHTML = welcomeHTML(); wireWelcome();
    return;
  }
  renderSheetHead();
  const tabs = tabsFor(fc.lvl);
  if (!tabs.includes(state.tab)) state.tab = tabs[0] || 'overview';
  $('#sheetTabs').hidden = tabs.length < 2;
  $('#sheetTabs').innerHTML = tabs.map(t => `<button type="button" role="tab" aria-selected="${t === state.tab}" data-tab="${t}">${TABS[t]}</button>`).join('');
  $$('#sheetTabs [data-tab]').forEach(b => b.addEventListener('click', () => { state.tab = b.dataset.tab; renderSheet(); }));
  const tb = $('#sheetTabs'), selT = tb.querySelector('[aria-selected="true"]');
  if (selT && selT.offsetLeft + selT.offsetWidth > tb.clientWidth) tb.scrollLeft = selT.offsetLeft + selT.offsetWidth - tb.clientWidth + 24;
  const moreT = () => tb.classList.toggle('more', tb.scrollLeft + tb.clientWidth < tb.scrollWidth - 4);
  tb.onscroll = moreT; moreT();
  const body = $('#sheetBody');
  const needs = sheetNeeds(fc.lvl, state.tab);
  const pending = needs.some(p => p.pending);
  if (pending) body.innerHTML = '<p class="caption">Loading</p>';
  try { await Promise.all(needs.map(n => n.p)); } catch (e) { body.innerHTML = '<p class="caption">Some data didn’t load. Try again.</p>'; return; }
  if (tok !== sheetToken) return;
  body.innerHTML = await tabHTML(fc.lvl, fc.id, state.tab);
  if (tok !== sheetToken) return;
  wireSheet(body);
  body.scrollTop = 0;
}
function sheetNeeds(lvl, tab) {
  const n = [];
  const want = (p, done) => n.push({p, pending:!done});
  if (lvl === 'zip') { want(loadDon(), !!DON); return n; }
  if (['overview','people'].includes(tab)) want(loadCensus(), !!model);
  if (['overview','homes'].includes(tab)) want(loadDoors(), !!DOORS);
  if (tab === 'overview' && lvl === 'ed') want(loadPolls(), !!POLLS);
  if (tab === 'homes') want(loadPolls(), !!POLLS);
  if (tab === 'conditions') want(loadConds(), !!CONDS);
  if (tab === 'money') want(loadFund(), !!FUND);
  return n;
}
function renderSheetHead() {
  const fc = state.focus; if (!fc) return;
  const {lvl, id} = fc, inc = inCmp(id) && lvl === state.level;
  let sub = '';
  if (lvl === 'ed') sub = EDM[id] ? `${EDM[id].boro} · Council ${EDM[id].cc ?? '–'} · Assembly ${EDM[id].ad} · Senate ${EDM[id].sd ?? '–'} · Congress ${EDM[id].cd ?? '–'}` : '';
  else if (lvl === 'tract') sub = `${tractBoro(id)}${TINFO[id] && TINFO[id][0] ? ' · ' + TINFO[id][0] : ''}`;
  else if (lvl === 'zip') sub = DON && DON.labels[id] && DON.labels[id] !== id ? `Includes ZIP codes ${DON.labels[id]}` : 'Political donations by donor ZIP code';
  else { const u = AGG[lvl].get(id); const boros = [...new Set(u.eds.map(e => EDM[e].boro))]; sub = `${lvl === 'boro' ? '' : boros.join(', ') + ' · '}${fmt(u.eds.length)} election districts`; if (lvl === 'cc' && REPS.cc[String(id)] && REPS.cc[String(id)].area) sub += ` · ${REPS.cc[String(id)].area}`; }
  const p = partial(lvl, id);
  $('#sheetHead').innerHTML = `<div class="row1"><div><div class="label">${esc(LEVELS[lvl].name)}</div><h2 class="sheet-title">${esc(lvl === 'boro' ? id : lvl === 'tract' ? 'Tract ' + tractCode(id) : lvl === 'zip' ? id : 'District ' + id)}</h2></div><button type="button" class="x" id="sheetX" aria-label="Close">×</button></div>
    <div class="sheet-sub">${esc(sub)}</div>${p ? `<p class="note" style="margin-top:6px">Only the NYC part of this district is counted (${p.nyc_share}% of its residents). The rest is in ${esc(p.outside)}.</p>` : ''}
    <div class="sheet-actions"><button type="button" class="btn sm" id="cmpBtn" aria-pressed="${inc}">${inc ? 'In compare' : '+ Compare'}</button><button type="button" class="btn sm" id="dlPlace">Download</button><button type="button" class="btn sm ghost" id="zoomPlace">Zoom to</button></div>`;
  $('#sheetX').addEventListener('click', clearFocus);
  $('#cmpBtn').addEventListener('click', () => { if (state.focus.lvl !== state.level) return; toggleCmp(state.focus.id); });
  $('#dlPlace').addEventListener('click', () => exportUnits(lvl, [id], `nyc_${LEVELS[lvl].file}_${slug(String(id))}`));
  $('#zoomPlace').addEventListener('click', () => { const l = layerById.get(id); if (l) fitTo(l.getBounds(), 16, true); });
}
function welcomeHTML() {
  return `<div class="welcome"><div><h2 class="sheet-title">Look up any place in New York City</h2><p class="caption" style="margin-top:4px">Voters, election results, residents, homes, neighborhood conditions and political money, for every district.</p></div>
    <div class="ways">
      <div class="way"><span class="ic">1</span><div><b>Search your address</b>Your poll site for November 3, your representatives, and your districts.</div></div>
      <div class="way"><span class="ic">2</span><div><b>Click any place on the map</b>Its profile opens here. Shift-click, or press “+ Compare”, to line places up side by side.</div></div>
      <div class="way"><span class="ic">3</span><div><b>Pick a topic in the card on the left</b>Voters, Elections, People, Homes, Neighborhood or Money, then any measure under it. One click each.</div></div>
    </div>
    <div class="sec"><h3>Try</h3><div class="chips">
      <button type="button" class="chip" data-try="cc:28">Council District 28</button>
      <button type="button" class="chip" data-try="race:2025-primary:democratic-mayor-citywide:final">2025 mayoral primary, final round</button>
      <button type="button" class="chip" data-try="m:k:evict_evict">Evictions</button>
      <button type="button" class="chip" data-try="m:f:vph">Voters per 100 homes</button>
      <button type="button" class="chip" data-try="m:m:fund">Council funding</button>
      <button type="button" class="chip" data-try="m:c:reg">Unregistered neighborhoods</button>
    </div></div></div>`;
}
function wireWelcome() {
  $$('#sheetBody [data-try]').forEach(b => b.addEventListener('click', async () => {
    const t = b.dataset.try;
    if (t.startsWith('m:')) return setMetric(t.slice(2));
    if (t.startsWith('race:')) { const [, e, c, r] = t.split(':'); state.res.round = r === 'final' ? 'final' : '1'; return pickRace(e, c, 'h2h'); }
    const [l, id] = t.split(':'); focusPlace(l, isId(l, id), {zoom:true});
  }));
}
// ranking of the focused place on the current layer
function spotlight(lvl, id) {
  if (lvl !== state.level || !available()) return '';
  const m = state.metric;
  if (leadMode()) {
    const r = unitRes(lvl, id), c = curC(); if (!r) return '';
    return `<div class="spot"><div class="k">${esc((r.contest || c).title)}${r.final ? ' · final round' : ''} · ${esc(ELSHORT[state.res.e])}</div>${resBars(r, 4)}<div class="c">${fmt(r.b)} ballots${turnoutOf(c, lvl, id, r) != null ? ` · ${pf(turnoutOf(c, lvl, id, r))} turnout` : ''}${r.partialCover ? ' · only part of this district voted in this race' : ''}</div></div>`;
  }
  const x = VALUES.get(id); if (x == null) return '';
  const rk = rankOf(x);
  let city = null;
  const f = famOf(m);
  if (f === 'voters') city = metricValue(CITY, m, state.status);
  else if (f === 'residents') { const cc = cityCtx(); city = cc ? cval(CIK[m.slice(2)], cc) : null; }
  else if (f === 'field') city = fieldValue(m.slice(2), 'cc', '__city');
  else if (f === 'conditions' && state.cmode === 'rate') city = condValue(m.slice(2), 'cc', '__city', 'rate');
  const extra = f === 'elections' ? (() => { const r = unitRes(lvl, id); return r ? resBars(r, 3) : ''; })() : '';
  return `<div class="spot"><div class="k">${esc(metricTitle())}</div><div class="v">${esc(fmtValue(x))}</div>
    ${rk && SORTED.length > 2 ? `<div class="rank"><span class="track"><i style="left:${(100 - rk.pos * 100).toFixed(1)}%"></i></span><span>${ord(rk.r)} highest of ${rk.n}</span></div>` : ''}
    ${city != null && famOf(m) !== 'elections' ? `<div class="c">All of NYC: ${esc(fmtValue(city))}</div>` : ''}${extra}</div>`;
}
function repList(lvl, id) {
  const out = [], add = (k, d) => { const r = REPS[k] && REPS[k][String(d)]; if (r) out.push({k, d, r}); };
  if (['cc','ad','sd','cd'].includes(lvl)) add(lvl, id);
  else if (lvl === 'ed' && EDM[id]) for (const k of ['cc','ad','sd','cd']) if (EDM[id][k] != null) add(k, EDM[id][k]);
  return out;
}
function repHTML({k, d, r}) {
  const role = `${ROLE[k]} · ${LEVELS[k].short} ${d}`;
  if (r.vacant) return `<div class="rep"><div class="role">${esc(role)}</div><div class="name">Vacant</div><p class="caption">No one holds this seat now. The winner of the ${longDate(r.next_election)} election takes office in January.</p></div>`;
  const contact = [r.phone ? `<span class="tnum">${esc(r.phone)}</span>` : '', r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '', r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Website</a>` : ''].filter(Boolean).join('');
  const notes = [];
  if (r.took_office_after_last_general) notes.push(`Took office after the ${k === 'cc' ? '2025' : '2024'} election, which ${esc(r.last_election.winner)} won.`);
  if (k !== 'cc' && r.next_election === '2026-11-03') notes.push('On the ballot November 3, 2026.');
  return `<div class="rep"><div class="role">${esc(role)}${r.title ? ` · <b>${esc(r.title)}</b>` : ''}</div><div class="name">${esc(r.name)}${r.party ? `<span class="party p-${esc(r.party.slice(0, 3).toLowerCase())}">${esc(r.party)}</span>` : ''}</div>
    ${contact ? `<div class="contact">${contact}</div>` : ''}${r.office ? `<p class="caption">${k === 'cd' ? 'Washington office' : 'District office'}: ${esc(r.office)}</p>` : ''}${notes.length ? `<p class="caption">${notes.join(' ')}</p>` : ''}</div>`;
}
function repsSection(lvl, id) {
  if (lvl === 'boro') { const bp = (REPS.city || []).find(c => c.office === 'Borough President' && c.area === id); return bp ? `<div class="sec"><h3>Borough President</h3><div class="rep"><div class="name">${esc(bp.name)}</div><p class="caption">Elected November 2025.</p></div></div>` : ''; }
  const list = repList(lvl, id); if (!list.length) return '';
  return `<div class="sec"><h3>${list.length > 1 ? 'Representatives' : 'Representative'}</h3><div class="grid1">${list.map(repHTML).join('')}</div></div>`;
}
function siteHTML(s, kind) {
  if (s == null) return '';
  const [name, addr, boro] = POLLS.sites[s];
  return `<div class="site"><div class="role">${kind === 'eday' ? `Election Day · Tue Nov 3 · ${esc(POLLS.eday_hours)}` : 'Early voting · Oct 24 to Nov 1'}</div><div class="name">${esc(name)}</div><p class="caption">${esc(addr)}, ${esc(boro)} · <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr + ', ' + boro + ', NY')}" target="_blank" rel="noopener">Directions</a></p></div>`;
}
function pollSection(ed) {
  if (!POLLS) return '';
  const p = POLLS.ed[String(ed)]; if (!p) return '';
  const ad = EDM[ed] && EDM[ed].ad, n = POLLS.new_eds_by_ad[String(ad)];
  return `<div class="sec"><h3>Where to vote</h3>${siteHTML(p[0], 'eday')}${p[1] !== p[0] ? siteHTML(p[1], 'early') : '<p class="caption">Early voting, October 24 to November 1, is at the same site.</p>'}
    ${n ? `<p class="note">The Board of Elections added ${n.length} election district${n.length === 1 ? '' : 's'} in Assembly District ${ad} that aren’t on any city map yet. Confirm your site at <a href="${POLLS.lookup}" target="_blank" rel="noopener">findmypollsite.vote.nyc</a>.</p>` : ''}</div>`;
}
function tile(k, v, c) { return `<div class="tile"><span class="k">${esc(k)}</span><span class="v">${v}</span>${c ? `<span class="c">${c}</span>` : ''}</div>`; }
async function tabHTML(lvl, id, tab) {
  if (lvl === 'zip') return zipHTML(id);
  const u = AGG[lvl].get(id), v = u.v, st = state.status, ctx = unitCtx(lvl, id), city = cityCtx();
  if (tab === 'overview') {
    const a = doorsOf(lvl, id);
    const tiles = [
      tile('Registered voters', fmt(v[6]) + (lvl === 'tract' ? '<small class="caption"> est.</small>' : ''), `${pf(share(v, 0, 0), 0)} Democrats · ${pf(share(v, 0, 1), 0)} Republicans`),
      tile('Eligible voters', ctx ? fmtC(CIK.cvap, cval(CIK.cvap, ctx)) : '–', ctx ? `${fmtC(CIK.reg, cval(CIK.reg, ctx))} active voters per 100 eligible` : ''),
      tile('Homes', a ? fmt(a[DF.units]) : '–', a && a[DF.units] >= 20 ? `${(v[13] / a[DF.units] * 100).toFixed(0)} active voters per 100 homes` : ''),
      tile('Median household income', ctx ? fmtC(CIK.med_inc, cval(CIK.med_inc, ctx)) : '–', city ? `All of NYC: ${fmtC(CIK.med_inc, cval(CIK.med_inc, city))}` : '')
    ].join('');
    const inside = lvl === 'ed' ? '' : lvl === 'tract' ? '' : overlapChips(lvl, u);
    const memberChips = lvl === 'ed' && EDM[id] ? `<div class="sec"><h3>Part of</h3><div class="chips">${['cc','ad','sd','cd'].filter(k => EDM[id][k] != null).map(k => `<button type="button" class="chip" data-goto="${k}:${EDM[id][k]}">${LEVELS[k].short} ${EDM[id][k]}</button>`).join('')}<button type="button" class="chip" data-goto="boro:${esc(EDM[id].boro)}">${esc(EDM[id].boro)}</button></div></div>` : '';
    return spotlight(lvl, id) + repsSection(lvl, id) + (lvl === 'ed' ? pollSection(id) : '') + `<div class="sec"><h3>At a glance</h3><div class="tiles">${tiles}</div></div>` + memberChips + inside;
  }
  if (tab === 'voters') {
    const o = st * 7, rows = PARTIES.map((p, i) => `<div class="stat"><span>${PNAME[p]}</span><b>${fmt(v[o + i])} <small>${pf(share(v, st, i))} · NYC ${pf(share(CITY, st, i))}</small></b></div>`).join('');
    return `<div class="sec"><h3>${['All registered voters', 'Active voters', 'Inactive voters'][st]}${lvl === 'tract' ? ', estimated' : ''}</h3><div class="tile"><span class="v">${fmt(v[o + 6])}</span></div>${pbar(v, st)}</div>
      <div class="sec"><h3>By party</h3><div class="stats">${rows}</div></div>
      <div class="sec"><h3>More</h3><div class="stats"><div class="stat"><span>Democrats minus Republicans</span><b>${gap(metricValue(v, 'margin', st))} <small>NYC ${gap(metricValue(CITY, 'margin', st))}</small></b></div>
      <div class="stat"><span>Inactive voters</span><b>${pf(v[6] ? v[20] / v[6] * 100 : null)} <small>NYC ${pf(CITY[20] / CITY[6] * 100)}</small></b></div>
      ${lvl !== 'tract' ? `<div class="stat"><span>Election districts</span><b>${fmt(u.eds.length)}</b></div>` : ''}</div></div>
      <p class="caption">Switch between all, active and inactive voters in the card on the map.</p>`;
  }
  if (tab === 'elections') return `<div class="sec"><h3>Recent races here</h3><div id="racesBox" class="grid1"><p class="caption">Loading four elections</p></div></div>`;
  if (tab === 'people') {
    if (!ctx || !ctx.c || !(ctx.c[F.pop] > 0)) return '<p class="caption">No census residents counted here.</p>';
    const stat = k => { const i = CIK[k], r = ev(i, ctx), cr = city ? ev(i, city) : null; return `<div class="stat"><span>${esc(i.short || i.label)}</span><b>${fmtC(i, r.x)}${relDot(r.rel)} <small>${r.moe != null ? fmtMoe(i, r.moe) + ' · ' : ''}NYC ${cr ? fmtC(i, cr.x) : '–'}</small></b></div>`; };
    const groups = topGroups(ctx.c, i => i.origin && !['n_wi'].includes(i.k)).map(([i, x]) => `${esc(i.label)} ${pf(x, 0)}`).join(' · ');
    const langs = topGroups(ctx.c, i => i.lang, 3).map(([i, x]) => `${esc(i.short || i.label)} ${pf(x, 0)}`).join(' · ');
    return `<div class="sec"><h3>Race and ethnicity</h3>${raceBar(ctx.c)}</div>
      <div class="sec"><h3>Key numbers</h3><div class="stats">${['pop','cvap','reg','med_inc','pov','renter','lep_hh','fborn','ba_plus','age65p'].filter(k => CIK[k]).map(stat).join('')}</div></div>
      ${groups ? `<div class="sec"><h3>Largest origin groups</h3><p class="caption">${groups}</p></div>` : ''}
      ${langs ? `<div class="sec"><h3>Top languages besides English</h3><p class="caption">${langs}</p></div>` : ''}
      <p class="caption">± is the 90% margin of error. <i class="reldot rel-medium"></i> medium and <i class="reldot rel-low"></i> low reliability. <button type="button" class="link" data-all="1">See all ${CI.length} measures</button></p>`;
  }
  if (tab === 'homes') {
    const a = doorsOf(lvl, id); if (!a || !(a[DF.units] > 0)) return '<p class="caption">No homes recorded here.</p>';
    const t = a[DF.units];
    const sites = lvl === 'ed' ? '' : (() => { const s = new Set(u.eds.map(e => POLLS.ed[e] && POLLS.ed[e][0]).filter(x => x != null)); return s.size ? `<div class="sec"><h3>Poll sites</h3><p class="caption">${fmt(s.size)} Election Day poll sites serve this ${lvl === 'tract' ? 'tract' : 'district'}. <button type="button" class="link" data-polls="1">Show them on the map</button></p></div>` : ''; })();
    return `<div class="sec"><h3>Homes</h3><div class="tiles">${tile('Homes', fmt(t), `NYC ${fmt(DCITY[DF.units])}`)}${tile('Active voters per 100 homes', t >= 20 ? (v[13] / t * 100).toFixed(0) : '–', `NYC ${(CITY[13] / DCITY[DF.units] * 100).toFixed(0)}`)}${tile('In NYCHA public housing', pf(a[DF.nycha] / t * 100, 0), `NYC ${pf(DCITY[DF.nycha] / DCITY[DF.units] * 100, 0)}`)}${tile('Residential buildings', fmt(a[DF.bldgs]), '')}</div></div>
      <div class="sec"><h3>Building size</h3>${homesBar(a)}<p class="caption">Doors in big buildings often need lobby access; one- and two-family blocks are quick to walk.</p></div>${lvl === 'ed' ? pollSection(id) : sites}`;
  }
  if (tab === 'conditions') {
    let html = '', g = '';
    for (const k of COND) {
      if (k.g !== g) { if (g) html += '</div></div>'; g = k.g; html += `<div class="sec"><h3>${esc(g)} · ${esc(condWindow(k.src))}</h3><div>`; }
      const r = condValue(k.k, lvl, id, 'rate'), n = condCount(k.k, lvl, id), cr = condValue(k.k, 'cc', '__city', 'rate');
      const ratio = r != null && cr ? r / cr : null, w = ratio == null ? 0 : Math.min(100, ratio / 2 * 100);
      html += `<div class="cmpbar"><span>${esc(k.label)}<small>${fmt(n)} in 12 months</small></span><span class="ratio" title="${ratio == null ? '' : ratio.toFixed(1) + ' times the city rate'}"><i style="width:${w}%;background:${ratio == null ? 'transparent' : ratio > 1.25 ? 'var(--hi)' : ratio < .8 ? 'var(--lo)' : 'var(--faint)'}"></i><em></em></span><b>${r == null ? '–' : r >= 100 ? fmt(r) : r.toFixed(1)}</b></div>`;
    }
    html += '</div></div>';
    return `<p class="caption">Per 1,000 residents (housing items per 1,000 homes). The bar compares with the whole city: the line in the middle is the city rate, red is well above it, green well below.</p>${html}`;
  }
  if (tab === 'money') return fundHTML(id);
  return '';
}
function overlapChips(lvl, u) {
  const groups = ['cc','ad','sd','cd'].filter(k => k !== lvl).map(k => {
    const m = new Map(); let tot = 0;
    for (const ed of u.eds) { const d = EDM[ed] && EDM[ed][k]; if (d == null) continue; const n = EDV[ed][6]; m.set(d, (m.get(d) || 0) + n); tot += n; }
    const list = [...m.entries()].sort((a, b) => b[1] - a[1]).filter(([, n]) => n / tot >= .01);
    return list.length ? `<div><span class="label">${LEVELS[k].short}</span><div class="chips" style="margin-top:4px">${list.map(([d, n]) => `<button type="button" class="chip" data-goto="${k}:${d}">${d} <span style="color:var(--faint);font-weight:500">${Math.round(n / tot * 100)}%</span></button>`).join('')}</div></div>` : '';
  }).filter(Boolean);
  return groups.length ? `<div class="sec"><h3>Overlaps with (share of voters)</h3><div class="grid1">${groups.join('')}</div></div>` : '';
}
function fundHTML(id) {
  const f = FUND.cc[String(id)]; if (!f) return '<p class="caption">No designations recorded.</p>';
  return `<div class="sec"><h3>Council discretionary funding, fiscal year 2027</h3><div class="tiles">${tile('Designated', money(f.total), `${fmt(f.n)} grants`)}${tile('Groups funded', fmt(f.orgs), '')}</div>
    <div class="stats">${Object.entries(f.by_category).map(([k, v]) => `<div class="stat"><span>${esc(k)}</span><b>${money(v)}</b></div>`).join('')}</div></div>
    <div class="sec"><h3>Largest grants</h3><div class="stats">${f.rows.slice(0, 8).map(r => `<div class="stat"><span title="${esc(r[6])}">${esc(r[0])}<small>${esc(r[2])} · ${esc(r[3])}</small></span><b>${money(r[1])}</b></div>`).join('')}</div>
    <div><button type="button" class="btn sm" data-fundlist="${id}">See all ${fmt(f.n)} grants</button></div></div>
    <p class="caption">From the Council’s funding disclosure as of ${esc(FUND.as_of)}. Citywide initiatives and the Speaker’s designations aren’t credited to a district.</p>`;
}
function zipHTML(id) {
  const a = DON.areas[id] || {}, c = a.cfb, f = a.fec, pop = +DON.pop[id] || 0;
  const tops = list => `<div class="stats">${list.map(([n, v]) => `<div class="stat"><span>${esc(n)}</span><b>${money(v)}</b></div>`).join('')}</div>`;
  return `${spotlight('zip', id)}
    <div class="sec"><h3>2025 city races</h3>${c ? `<div class="tiles">${tile('Given', money(c.total), `${fmt(c.donors)} donors`)}${tile('Per resident', pop ? '$' + (c.total / pop).toFixed(2) : '–', `${pf(c.small / c.total * 100, 0)} in gifts of $250 or less`)}</div>
      <div class="stats">${Object.entries(c.by_office).map(([k, v]) => `<div class="stat"><span>${esc(k)}</span><b>${money(v)}</b></div>`).join('')}</div><span class="label">Top recipients</span>${tops(c.top.slice(0, 6))}` : '<p class="caption">No contributions recorded.</p>'}</div>
    <div class="sec"><h3>Federal, 2025 and 2026</h3>${f ? `<div class="tiles">${tile('Given', money(f.total), `${fmt(f.donors)} donors`)}${tile('To Democrats', money((f.by_party || {}).Democratic || 0), `To Republicans ${money((f.by_party || {}).Republican || 0)}`)}</div><span class="label">Top recipients</span>${tops(f.top.slice(0, 6))}` : '<p class="caption">No itemized contributions recorded.</p>'}</div>
    <p class="caption">${pop ? `About ${fmt(pop)} residents. ` : ''}By the donor’s ZIP code. Federal totals only list donors who gave a committee more than $200.</p>`;
}
async function racesHTML(lvl, id) {
  const parts = [];
  for (const e of ELX) {
    const E = await loadElection(e.id);
    if (lvl === 'ed' && !E.same_lines_as_map) continue;
    const top = E.contests.filter(c => c.scope[0] === 'city' && !prep(c).proposal).sort((a, b) => b.ballots - a.ballots).slice(0, e.id.endsWith('primary') ? 2 : 1);
    const own = ['cc','ad','sd','cd'].includes(lvl) ? E.contests.filter(c => c.scope[0] === lvl && String(c.scope[1]) === String(id)) : lvl === 'boro' ? E.contests.filter(c => c.scope[0] === 'boro' && c.scope[1] === id && /Borough President/.test(c.office)) : [];
    for (const c of [...top, ...own]) {
      const save = state.res.round; state.res.round = c.rcv ? 'final' : '1';
      let r = null; try { r = unitRes(lvl, id, E, c); } finally { state.res.round = save; }
      if (!r || !r.tot) continue;
      parts.push(`<div class="race"><span class="when">${esc(ELSHORT[e.id])}${r.final ? ' · final round' : ''}</span><span class="what">${esc(c.title)}</span>${resBars(r, 3)}<p class="caption">${fmt(r.b)} ballots${r.partialCover ? ' · only part of this district voted in this race' : ''} · <button type="button" class="link" data-race='${esc(JSON.stringify([e.id, c.id]))}'>Map this race</button></p></div>`);
    }
  }
  return parts.length ? parts.join('') + (lvl === 'ed' ? '<p class="caption">Earlier elections used different election district lines. Open the district this one belongs to for those.</p>' : '') : '<p class="caption">No results found here.</p>';
}
function wireSheet(root) {
  root.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => { const [k, ...v] = b.dataset.goto.split(':'); focusPlace(k, isId(k, v.join(':')), {zoom:true}); }));
  root.querySelectorAll('[data-polls]').forEach(b => b.addEventListener('click', async () => { if (!state.polls.has('eday')) { state.polls.add('eday'); await setPolls('eday', true); renderLineToggles(); writeHash(); } const l = layerById.get(state.focus.id); if (l) fitTo(l.getBounds(), 15, true); }));
  root.querySelectorAll('[data-fundlist]').forEach(b => b.addEventListener('click', () => openFundList(+b.dataset.fundlist)));
  root.querySelectorAll('[data-all]').forEach(b => b.addEventListener('click', () => openCompare([state.focus.id])));
  const box = root.querySelector('#racesBox');
  if (box) { const fc = state.focus, tok = sheetToken; racesHTML(fc.lvl, fc.id).then(h => { if (tok === sheetToken) { box.innerHTML = h; box.querySelectorAll('[data-race]').forEach(b => b.addEventListener('click', () => { const [e, c] = JSON.parse(b.dataset.race); state.res.round = '1'; pickRace(e, c, 'lead'); })); } }).catch(() => { box.innerHTML = '<p class="caption">Results didn’t load. Try again.</p>'; }); }
}

// ---------- address ----------
function renderAddr() {
  const a = state.addr, el = $('#addrBlock');
  if (!a) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false; el.className = 'addr';
  if (a.ed == null) { el.innerHTML = `<div class="row1" style="display:flex;justify-content:space-between;gap:8px"><span class="lab">${esc(a.label)}</span><button type="button" class="link" id="addrX">Clear</button></div><p class="caption">This spot isn’t inside a mapped election district. It may be in a park, on the water, or outside the city.</p>`; }
  else {
    const m = EDM[a.ed];
    const city = (REPS.city || []).filter(c => c.area === 'Citywide' || c.area === m.boro).map(c => `${esc(c.office)}: <b>${esc(c.name)}</b>`).join(' · ');
    el.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><span class="lab">${esc(a.label)}</span><button type="button" class="link" id="addrX">Clear</button></div>
      ${POLLS ? pollSection(a.ed) : '<p class="caption">Loading your poll site</p>'}
      <div class="sec"><h3>Your representatives</h3><div class="grid1">${repList('ed', a.ed).map(repHTML).join('')}</div>${city ? `<p class="caption">${city}</p>` : ''}</div>
      <div class="sec"><h3>Your districts</h3><div class="chips">${[['ed', a.ed], ['cc', m.cc], ['ad', m.ad], ['sd', m.sd], ['cd', m.cd], ['tract', a.tract], ['boro', m.boro], ['zip', a.zip]].filter(([, v]) => v != null).map(([k, v]) => `<button type="button" class="chip" data-goto="${k}:${esc(v)}" aria-current="${state.focus && state.focus.lvl === k}">${esc(k === 'boro' ? v : unitName(k, v))}</button>`).join('')}</div></div>
      <p class="caption">Right on a district line? Confirm at <a href="https://findmypollsite.vote.nyc/" target="_blank" rel="noopener">findmypollsite.vote.nyc</a>.</p>`;
    el.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => { const [k, ...v] = b.dataset.goto.split(':'); focusPlace(k, isId(k, v.join(':')), {zoom:true, keepAddr:true}); }));
  }
  $('#addrX').addEventListener('click', () => { state.addr = null; $('#q').value = ''; renderAddr(); renderLabels(); });
}
const findIn = CityCore.findIn;
async function gotoAddress(label, lat, lng, zip) {
  await Promise.all([loadPolls(), loadTracts().catch(() => null), zip ? loadDon().catch(() => null) : null]);
  const ed = findIn(FEAT.ed, lng, lat, f => f.properties.id), tract = FEAT.tract ? findIn(FEAT.tract, lng, lat, f => f.properties.GEOID) : null;
  state.addr = {label, ll:[lat, lng], ed, tract, zip: zip ? zipArea(zip) : null};
  $('#q').value = label;
  const lvl = state.level === 'zip' && !state.addr.zip ? 'cc' : state.level;
  const id = translateFocus({lvl:'ed', id:ed}, lvl);
  map.flyTo([lat, lng], Math.max(map.getZoom(), 15), {duration:.7});
  if (id != null) await focusPlace(lvl, id, {keepAddr:true}); else { renderSheet(); renderLabels(); }
  if (NARROW()) toast('Your poll site and representatives are below the map.');
}
const ZIP_TO_AREA = {};
function zipArea(z) {
  if (AGG.zip.has(z)) return z;
  if (!Object.keys(ZIP_TO_AREA).length && DON) for (const [a, lab] of Object.entries(DON.labels)) for (const x of String(lab).match(/\d{5}/g) || []) ZIP_TO_AREA[x] = a;
  return ZIP_TO_AREA[z] || null;
}

// ---------- compare ----------
function renderTray() {
  const lvl = state.level, ids = state.cmp[lvl], t = $('#tray');
  if (!ids.length) { t.hidden = true; return; }
  t.hidden = false;
  t.innerHTML = `<span class="lab">Compare</span>${ids.map(id => `<span class="chip">${esc(unitName(lvl, id))}<button type="button" data-unpin="${esc(id)}" aria-label="Remove ${esc(unitName(lvl, id))}">×</button></span>`).join('')}
    <button type="button" class="btn primary sm" id="trayOpen">${ids.length > 1 ? `Compare ${ids.length} side by side` : 'See every number'}</button><button type="button" class="btn ghost sm" id="trayClear">Clear</button>`;
  $$('#tray [data-unpin]').forEach(b => b.addEventListener('click', () => toggleCmp(isId(lvl, b.dataset.unpin))));
  $('#trayOpen').addEventListener('click', () => openCompare());
  $('#trayClear').addEventListener('click', () => { state.cmp[lvl] = []; restyle(); renderLabels(); renderTray(); renderSheetHead(); writeHash(); });
}
const openGroups = new Set(['Voters by party', 'Key numbers', 'Representatives', 'Donations', 'Homes']);
let cmpIds = [];
async function openCompare(ids) {
  cmpIds = ids || state.cmp[state.level];
  if (!cmpIds.length) return;
  await Promise.all([loadCensus(), loadDoors(), loadConds().catch(() => null), loadPolls(), state.level === 'cc' ? loadFund().catch(() => null) : null, state.level === 'zip' ? loadDon() : null]);
  renderCompare(); $('#cmpDlg').showModal();
}
function renderCompare() {
  const lvl = state.level, ids = cmpIds, st = state.status, o = st * 7;
  $('#cmpTitle').textContent = ids.length > 1 ? `Comparing ${ids.length} ${LEVELS[lvl].plural}` : unitLong(lvl, ids[0]);
  const groups = [];
  const group = (title, rows) => rows && groups.push(`<tbody><tr class="group"><td colspan="99"><button type="button" data-g="${esc(title)}" aria-expanded="${openGroups.has(title)}">${esc(title)}</button></td></tr></tbody><tbody ${openGroups.has(title) ? '' : 'hidden'} data-gb="${esc(title)}">${rows}</tbody>`);
  if (lvl === 'zip') {
    const all = ids.map(id => ({id, label:unitName(lvl, id), a:DON.areas[id] || {}}));
    const row = (name, fn) => `<tr><td>${name}</td>` + all.map(c => `<td>${fn(c)}</td>`).join('') + '</tr>';
    group('Donations', row('Residents (est.)', c => fmt(DON.pop[c.id])) + row('2025 city races', c => money(c.a.cfb ? c.a.cfb.total : 0)) + row('City donors', c => fmt(c.a.cfb ? c.a.cfb.donors : 0))
      + row('City, per resident', c => c.a.cfb && DON.pop[c.id] ? '$' + (c.a.cfb.total / DON.pop[c.id]).toFixed(2) : '–') + row('Federal 2025 and 2026', c => money(c.a.fec ? c.a.fec.total : 0)) + row('Federal donors', c => fmt(c.a.fec ? c.a.fec.donors : 0))
      + row('Federal to Democrats', c => money(c.a.fec && c.a.fec.by_party.Democratic || 0)) + row('Federal to Republicans', c => money(c.a.fec && c.a.fec.by_party.Republican || 0))
      + row('Top city recipient', c => c.a.cfb && c.a.cfb.top[0] ? esc(c.a.cfb.top[0][0]) : '–') + row('Top federal recipient', c => c.a.fec && c.a.fec.top[0] ? esc(c.a.fec.top[0][0]) : '–'));
    $('#cmpBody').innerHTML = `<div class="tablewrap"><table><thead><tr><th></th>${all.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>${groups.join('')}</table></div>`;
    wireGroups(); $('#cmpNote').textContent = 'By donor ZIP code.'; $('#exEds').hidden = true; $('#exAll').textContent = 'Download all ZIP code areas';
    return;
  }
  const columns = ids.map(id => ({id, label:unitName(lvl, id), u:AGG[lvl].get(id), v:AGG[lvl].get(id).v, ctx:unitCtx(lvl, id)}));
  if (ids.length > 1) { const {v, ctx} = combined(lvl, ids); columns.push({label:'All together', v, u:{eds:ids.flatMap(id => AGG[lvl].get(id).eds)}, ctx, combined:true, ids}); }
  const all = [...columns, {label:'All of NYC', v:CITY, ref:true, u:{eds:[]}, ctx:cityCtx(), id:'__city'}];
  const head = `<tr><th>${['All voters', 'Active voters', 'Inactive voters'][st]}${lvl === 'tract' ? ' (est.)' : ''}</th>` + all.map(c => `<th class="${c.ref ? 'ref' : ''}">${esc(c.label)}</th>`).join('') + '</tr>';
  const row = (name, fn, cls = '') => `<tr><td>${name}</td>` + all.map(c => `<td class="${cls} ${c.ref ? 'ref' : ''}">${fn(c)}</td>`).join('') + '</tr>';
  const sumOf = (c, fn) => c.combined ? c.ids.reduce((s, id) => s + (fn(id) || 0), 0) : fn(c.id);
  if (['cc','ad','sd','cd','ed'].includes(lvl)) {
    const roles = lvl === 'ed' ? ['cc','ad','sd','cd'] : [lvl];
    group('Representatives', roles.map(k => row(ROLE[k], c => { if (c.ref || c.combined) return ''; const d = lvl === 'ed' ? EDM[c.id] && EDM[c.id][k] : c.id; const r = REPS[k] && REPS[k][String(d)]; return r ? esc(r.vacant ? 'Vacant' : r.name) : '–'; }, 'wrap')).join(''));
  }
  let r = row('Total', c => `<b>${fmt(c.v[o + 6])}</b>`);
  PARTIES.forEach((p, i) => { r += row(PNAME[p], c => `${fmt(c.v[o + i])}<span class="pct">${pf(share(c.v, st, i))}</span>`); });
  r += row('Democrats minus Republicans', c => gap(metricValue(c.v, 'margin', st))) + row('Inactive share', c => pf(c.v[6] ? c.v[20] / c.v[6] * 100 : null));
  group('Voters by party', r);
  if (state.metric === 'r' && curC() && resAvailable(curC(), lvl) && !vintageMode()) {
    const cc = curC(), names = candOptions(cc).slice(0, 8), resOf = c => c.combined || c.ref ? null : unitRes(lvl, c.id);
    let rr = names.map(nm => row(esc(nm), c => { const x = resOf(c); if (!x || !x.tot) return '–'; const it = x.items.find(i => i.name === nm); return it ? `${fmt(it.votes)}<span class="pct">${pf(it.votes / x.tot * 100)}</span>` : '–'; })).join('');
    rr += row('Ballots', c => { const x = resOf(c); return x ? fmt(x.b) : '–'; }) + row('Turnout', c => { const x = resOf(c); const t = x && turnoutOf(cc, lvl, c.id, x); return t != null ? pf(t) : '–'; });
    openGroups.add(`Election: ${cc.title}`); group(`Election: ${cc.title}`, rr);
  }
  for (const cat of CATS) group(cat.k === 'key' ? 'Key numbers' : cat.label, catItems(cat.k).map(i => row(esc(i.label), c => { const rv = ev(i, c.ctx); return `${fmtC(i, rv.x)}<span class="pct">${rv.moe != null ? fmtMoe(i, rv.moe) : ''}</span>${relDot(rv.rel)}`; })).join(''));
  const dOf = (c, k) => c.ref ? DCITY[DF[k]] : sumOf(c, id => { const a = doorsOf(lvl, id); return a ? a[DF[k]] : 0; });
  group('Homes', row('Homes', c => fmt(dOf(c, 'units'))) + row('Active voters per 100 homes', c => { const u = dOf(c, 'units'); return u >= 20 ? (c.v[13] / u * 100).toFixed(0) : '–'; })
    + HOME_SEG.map(([k, l]) => row(`In ${l}${k === 'u1_2' ? '' : ' unit'} buildings`, c => { const u = dOf(c, 'units'); return u ? pf(dOf(c, k) / u * 100) : '–'; })).join('')
    + row('In NYCHA', c => { const u = dOf(c, 'units'); return u ? pf(dOf(c, 'nycha') / u * 100) : '–'; }));
  if (CAGG && lvl !== 'tract') group('Neighborhood conditions, per 1,000', COND.map(k => row(`${esc(k.label)} <span class="pct">${esc(condWindow(k.src))}</span>`, c => {
    const n = c.ref ? CAGG.city[CF[k.k]] : sumOf(c, id => condCount(k.k, lvl, id));
    const den = dOf(c, k.per === 'hu' ? 'hu20' : 'pop20');
    return den >= (k.per === 'hu' ? 100 : 200) ? `${(n / den * 1000).toFixed(1)}<span class="pct">${fmt(n)}</span>` : `–<span class="pct">${fmt(n)}</span>`;
  })).join(''));
  if (lvl === 'cc' && FUND) group('Council discretionary funding, FY2027', row('Total designated', c => c.ref ? money(Object.values(FUND.cc).reduce((s, x) => s + x.total, 0)) : money(sumOf(c, id => FUND.cc[String(id)] ? FUND.cc[String(id)].total : 0))) + row('Grants', c => c.ref ? '' : fmt(sumOf(c, id => FUND.cc[String(id)] ? FUND.cc[String(id)].n : 0))));
  if (lvl === 'ed') group('Where it sits', ['cc','ad','sd','cd','boro'].map(k => row(k === 'boro' ? 'Borough' : LEVELS[k].short, c => c.combined || c.ref ? '' : esc(EDM[c.id] && EDM[c.id][k] != null ? EDM[c.id][k] : '–'))).join('')
    + row('Election Day poll site', c => { if (c.combined || c.ref) return ''; const p = POLLS.ed[String(c.id)]; return p && p[0] != null ? esc(POLLS.sites[p[0]][0]) : '–'; }, 'wrap'));
  $('#cmpBody').innerHTML = `<div class="tablewrap"><table><thead>${head}</thead>${groups.join('')}</table></div>
    <p class="caption" style="margin-top:10px">Census numbers are split into districts by 2020 Census blocks; ± is the 90% margin of error; <i class="reldot rel-medium"></i> medium and <i class="reldot rel-low"></i> low reliability. Homes: PLUTO 26v2. Conditions: NYC Open Data, per 1,000 residents or homes (2020 Census).</p>`;
  wireGroups();
  const parts = ids.map(id => [id, partial(lvl, id)]).filter(([, p]) => p);
  $('#cmpNote').textContent = parts.length ? parts.map(([id, p]) => `${unitName(lvl, id)} counts only its NYC part (${p.nyc_share}% of residents).`).join(' ') : 'Click a section name to open or close it.';
  $('#exAll').textContent = `Download all ${LEVELS[lvl].plural}`;
  $('#exEds').textContent = lvl === 'tract' ? 'Download tract and election district pieces' : 'Download election districts inside';
  $('#exEds').hidden = lvl === 'ed';
}
function wireGroups() {
  $$('#cmpBody [data-g]').forEach(b => b.addEventListener('click', () => {
    const g = b.dataset.g, body = $(`#cmpBody tbody[data-gb="${CSS.escape(g)}"]`);
    body.hidden = !body.hidden; b.setAttribute('aria-expanded', !body.hidden); body.hidden ? openGroups.delete(g) : openGroups.add(g);
  }));
}
function combined(lvl, ids) {
  const v = new Array(21).fill(0); let n = 0;
  for (const id of ids) { const u = AGG[lvl].get(id); for (let i = 0; i < 21; i++) v[i] += u.v[i]; n += u.eds.length; }
  const k = CityCore.combine(model, lvl, ids), q = CityCore.combine(cvapModel, lvl, ids);
  return {v, n, ctx:{c:k.c, m:k.m, split:k.split, cvap:{c:q.c, m:q.m, split:q.split}, v}};
}

// funding list
let listRows = [], listName = '';
async function openFundList(d) {
  await loadFund();
  const f = FUND.cc[String(d)]; if (!f) return;
  const rep = REPS.cc[String(d)];
  $('#listTitle').textContent = `Council District ${d}: ${fmt(f.n)} grants, fiscal year 2027`;
  listRows = f.rows; listName = `nyc_council_district_${d}_discretionary_fy2027.csv`;
  $('#listNote').textContent = `${money(f.total)} total${rep && !rep.vacant ? `, designated by ${rep.name}` : ''}. NYC Council funding disclosure as of ${FUND.as_of}.`;
  $('#listQ').value = ''; renderList(); $('#listDlg').showModal();
}
function renderList() {
  const q = $('#listQ').value.trim().toLowerCase();
  const rows = listRows.filter(r => !q || r.join(' ').toLowerCase().includes(q));
  $('#listBody').innerHTML = `<div class="tablewrap"><table class="list"><thead><tr><th>Organization</th><th>Amount</th><th>Program</th><th>Agency</th><th>Status</th><th>Purpose</th></tr></thead><tbody>${rows.slice(0, 600).map(r => `<tr><td>${esc(r[0])}<div class="caption">${esc(r[5])}</div></td><td>${usd(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${esc(r[4])}</td><td class="wrap">${esc(r[6])}</td></tr>`).join('')}</tbody></table></div>${rows.length > 600 ? `<p class="caption">Showing 600 of ${rows.length}. Download for all.</p>` : ''}`;
}
$('#listQ').addEventListener('input', renderList);
$('#listDl').addEventListener('click', () => saveCsv(listName, [['organization','amount','program','agency','status','address','purpose'], ...listRows]));

// ---------- downloads ----------
const COLS21 = ['total','active','inactive'].flatMap(s => [...PARTIES, 'total'].map(p => `${p}_${s}`));
const csvEsc = x => { const s = x == null ? '' : String(x); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = rows => rows.map(r => r.map(csvEsc).join(',')).join('\r\n') + '\r\n';
const derived = v => [...PARTIES.map((p, i) => v[6] ? (v[i] / v[6] * 100).toFixed(2) : ''), v[6] ? ((v[0] - v[1]) / v[6] * 100).toFixed(2) : '', v[6] ? (v[20] / v[6] * 100).toFixed(2) : ''];
const DER_H = [...PARTIES.map(p => p + '_pct'), 'dem_minus_rep_pts', 'inactive_pct'];
const CEN_H = CI.flatMap(i => [i.col, i.col + '_moe', i.col + '_reliability']).concat(['share_of_residents_from_split_tracts', 'share_of_eligible_from_split_block_groups']);
const cenRow = ctx => CI.flatMap(i => { const r = ev(i, ctx); const nd = i.type === 'num' || i.type === 'usd' ? 0 : 1;
  return [r.x == null ? '' : r.x.toFixed(nd), r.moe == null ? '' : r.moe.toFixed(nd), r.rel]; }).concat([ctx && ctx.c ? ((ctx.split || 0) * 100).toFixed(1) : '', ctx && ctx.cvap ? ((ctx.cvap.split || 0) * 100).toFixed(1) : '']);
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
const pollRow = id => { const p = POLLS && POLLS.ed[String(id)]; return p ? [p[0] != null ? POLLS.sites[p[0]][0] : '', p[0] != null ? `${POLLS.sites[p[0]][1]}, ${POLLS.sites[p[0]][2]}` : '', p[1] != null ? POLLS.sites[p[1]][0] : '', p[1] != null ? `${POLLS.sites[p[1]][1]}, ${POLLS.sites[p[1]][2]}` : ''] : ['', '', '', '']; };
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
async function prepExport(lvl) { await Promise.all([loadCensus(), loadDoors(), loadPolls(), loadConds().catch(() => null), lvl === 'cc' ? loadFund().catch(() => null) : null, lvl === 'zip' ? loadDon() : null]); }
async function exportUnits(lvl, ids, base, withTotals) {
  await prepExport(lvl);
  if (lvl === 'zip') return saveCsv(`${base}.csv`, [ZIP_H, ...ids.map(zipRow)]);
  const rows = [UNIT_H(lvl), ...ids.map(id => unitRow(lvl, id))];
  if (withTotals && ids.length > 1) {
    const {v, n, ctx} = combined(lvl, ids);
    const dsum = DOORS.fields.map((_, i) => ids.reduce((s, id) => s + ((doorsOf(lvl, id) || [])[i] || 0), 0));
    const csum = CONDS && lvl !== 'tract' ? CONDS.fields.map((_, i) => ids.reduce((s, id) => s + ((CAGG[lvl].get(id) || [])[i] || 0), 0)) : null;
    rows.push(['All picked together', ids.join(' + '), '', lvl === 'tract' ? '' : n, ...v.map(x => Math.round(x)), ...derived(v), '', ...REP_H(lvl).map(() => ''), ...cenRow(ctx), ...homeRow(dsum), ...(csum ? condRow(lvl, null, csum, dsum) : COND_H().map(() => '')), ...FUND_H(lvl).map(() => '')]);
  }
  if (withTotals) rows.push(['All of NYC', 'NYC', '', ED_WITH_VOTERS, ...CITY, ...derived(CITY), '', ...REP_H(lvl).map(() => ''), ...cenRow(cityCtx()), ...homeRow(DCITY), ...(CONDS ? condRow(lvl, null, CAGG.city, DCITY) : []), ...FUND_H(lvl).map(() => '')]);
  saveCsv(`${base}_${STAMP}.csv`, rows);
}
$('#exCmp').addEventListener('click', () => exportUnits(state.level, cmpIds, `nyc_${LEVELS[state.level].file}_picked`, true));
$('#exAll').addEventListener('click', () => exportUnits(state.level, state.level === 'ed' ? sortIds('ed').filter(id => AGG.ed.get(id).eds.length || CityCore.unit(model, 'ed', id)) : sortIds(state.level), `nyc_all_${LEVELS[state.level].file}s`));
$('#exEds').addEventListener('click', async () => {
  const lvl = state.level, ids = cmpIds; if (!ids.length) return;
  await prepExport(lvl);
  if (lvl === 'tract') {
    const rows = [['tract_geoid','tract','election_district','share_of_tract_residents_2020','share_of_ed_residents_2020','council_district','assembly_district','senate_district','congressional_district']];
    for (const t of ids) for (const [ed, wp, we] of TPIECES.get(t) || []) { const m = EDM[ed] || {}; rows.push([t, tractCode(t), ed, wp, we, m.cc, m.ad, m.sd, m.cd]); }
    return saveCsv(`nyc_tract_election_district_pieces_${STAMP}.csv`, rows);
  }
  const rows = [[`picked_${LEVELS[lvl].file}`, 'election_district', 'borough', 'council_district', 'assembly_district', 'senate_district', 'congressional_district', ...COLS21, ...DER_H, ...REP_H('ed'), 'election_day_poll_site', 'election_day_address', 'early_voting_site', 'early_voting_address', ...CEN_H, ...HOME_H, ...COND_H()]];
  for (const id of ids) for (const ed of AGG[lvl].get(id).eds) { const m = EDM[ed], v = EDV[ed]; rows.push([id, ed, m.boro, m.cc, m.ad, m.sd, m.cd, ...v, ...derived(v), ...repRow('ed', ed), ...pollRow(ed), ...cenRow(unitCtx('ed', ed)), ...homeRow(doorsOf('ed', ed)), ...condRow('ed', ed)]); }
  saveCsv(`nyc_election_districts_in_picked_${LEVELS[lvl].file}_${STAMP}.csv`, rows);
});
function downloadResults() {
  const c = curC(), E = curE(); if (!c) return;
  const lvl = ['tract','zip'].includes(state.level) ? 'ed' : state.level;
  if (!resAvailable(c, lvl)) { toast(unavailText()); return; }
  const names = candOptions(c);
  const ids = lvl === 'ed' ? [...new Set(Object.keys(E.eds).map(Number))].sort((a, b) => a - b) : sortIds(lvl);
  const rows = [[lvl === 'ed' ? 'election_district' : LEVELS[lvl].name.toLowerCase().replace(/ /g, '_'), 'ballots', ...names.flatMap(n => [n, n + ' %']), 'turnout_pct', 'note']];
  for (const id of ids) {
    const r = unitRes(lvl, id); if (!r) continue;
    const t = turnoutOf(c, lvl, id, r);
    rows.push([id, r.b, ...names.flatMap(n => { const it = r.items.find(i => i.name === n); const v = it ? it.votes : 0; return [Math.round(v), r.tot ? (v / r.tot * 100).toFixed(2) : '']; }), t != null ? t.toFixed(2) : '', r.host ? `reported with ED ${r.host}` : r.partialCover ? 'only part of this district voted in this race' : '']);
  }
  saveCsv(`nyc_results_${state.res.e}_${slug(c.title)}${useFinal(c) ? '_final_round' : ''}_by_${lvl === 'ed' ? 'election_district_' + E.vintage : LEVELS[lvl].file}.csv`, rows);
}

// ---------- search: one box for places, people, topics and races ----------
const q = $('#q'), qList = $('#qList');
let qItems = [], qActive = -1, qAbort = null, qTimer = null;
const LEVEL_WORDS = [
  [/^(?:city\s*)?council(?:\s*district)?\s*#?\s*(\d{1,2})$|^cc\s*#?\s*(\d{1,2})$/i, 'cc'],
  [/^(?:state\s*)?assembly(?:\s*district)?\s*#?\s*(\d{1,2})$|^ad\s*#?\s*(\d{1,2})$/i, 'ad'],
  [/^(?:state\s*)?senate(?:\s*district)?\s*#?\s*(\d{1,2})$|^sd\s*#?\s*(\d{1,2})$/i, 'sd'],
  [/^congress(?:ional)?(?:\s*district)?\s*#?\s*(\d{1,2})$|^cd\s*#?\s*(\d{1,2})$|^ny\s*-?\s*(\d{1,2})$/i, 'cd'],
  [/^(?:ed|election\s*district)?\s*#?\s*([2-8]\d{4})$/i, 'ed']
];
const SYN = {doors:'homes', door:'homes', canvass:'homes', crime:'crime felonies', rats:'rodents', eviction:'evictions', donors:'given', donations:'given', citizens:'eligible', immigrants:'born outside', latino:'hispanic', rent:'rent renters', seniors:'65', young:'18 to 29', unregistered:'active voters per 100 eligible', registration:'active voters per 100 eligible', funding:'discretionary', bengali:'bengali bangladeshi'};
const norm = s => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
function placeMatches(t) {
  const out = [];
  for (const [re, lvl] of LEVEL_WORDS) {
    const m = t.match(re); if (!m) continue;
    const id = +(m[1] || m[2] || m[3]);
    if (AGG[lvl].has(id)) out.push({g:'Places', label:unitLong(lvl, id), sub:`${fmt(AGG[lvl].get(id).v[6])} voters`, tag:LEVELS[lvl].short, run:() => focusPlace(lvl, id, {zoom:true})});
  }
  const zm = t.match(/^(?:zip\s*)?(1[01]\d{3})$/i);
  if (zm) out.push({g:'Places', label:`ZIP code ${zm[1]}`, sub:'Political donations by donor ZIP code', tag:'ZIP', run:async () => { await loadDon(); const a = zipArea(zm[1]); if (a) focusPlace('zip', a, {zoom:true}); else toast('That ZIP code isn’t in the city’s ZIP areas.'); }});
  if (/^36\d{9}$/.test(t)) out.push({g:'Places', label:`Census tract ${t}`, sub:'', tag:'Tract', run:async () => { await loadTracts(); if (AGG.tract.has(t)) focusPlace('tract', t, {zoom:true}); }});
  if (/^\d{1,2}$/.test(t)) for (const lvl of ['cc','ad','sd','cd']) { const id = +t; if (AGG[lvl].has(id)) out.push({g:'Places', label:unitLong(lvl, id), sub:`${fmt(AGG[lvl].get(id).v[6])} voters`, tag:LEVELS[lvl].short, run:() => focusPlace(lvl, id, {zoom:true})}); }
  if (t.length >= 3) for (const b of AGG.boro.keys()) if (b.toLowerCase().startsWith(t.toLowerCase())) out.push({g:'Places', label:b, sub:`${fmt(AGG.boro.get(b).v[6])} voters`, tag:'Borough', run:() => focusPlace('boro', b, {zoom:true})});
  if (t.length >= 3 && !/^\d/.test(t)) for (const k of ['cc','ad','sd','cd']) for (const [d, r] of Object.entries(REPS[k])) if (!r.vacant && norm(r.name).includes(norm(t))) out.push({g:'People', label:r.name, sub:`${ROLE[k]}, ${LEVELS[k].short} ${d}`, tag:'Rep', run:() => focusPlace(k, +d, {zoom:true})});
  return out.slice(0, 7);
}
function topicMatches(t) {
  if (t.length < 3 || /^\d/.test(t)) return [];
  const terms = norm(t).split(/\s+/).flatMap(w => [w, ...(SYN[w] ? SYN[w].split(' ') : [])]);
  const score = s => { const w = norm(s); return terms.reduce((n, x) => n + (w.includes(x) ? (w.startsWith(x) ? 3 : 2) : 0), 0); };
  const hits = [];
  for (const m of METRICS) hits.push([{g:'Map layers', label:m.label, sub:'Voters', run:() => setMetric(m.k)}, score(m.label)]);
  for (const i of CI) hits.push([{g:'Map layers', label:i.label, sub:'People', run:() => setMetric('c:' + i.k)}, score(i.label + ' ' + (i.desc || ''))]);
  for (const f of FIELD) hits.push([{g:'Map layers', label:f.label, sub:'Homes', run:() => setMetric('f:' + f.k)}, score(f.label + ' ' + f.desc)]);
  for (const c of COND) hits.push([{g:'Map layers', label:c.label, sub:'Neighborhood', run:() => setMetric('k:' + c.k)}, score(c.label + ' ' + c.g + ' ' + (c.desc || ''))]);
  for (const mm of MONEY) hits.push([{g:'Map layers', label:mm.label, sub:'Money', run:() => setMetric('m:' + mm.k)}, score(mm.label + ' ' + mm.desc)]);
  const races = [];
  for (const [eid, cid, title, cands, ballots] of ELIX.contests) {
    const cand = cands.find(n => terms.some(x => x.length >= 3 && norm(n).includes(x)));
    if (cand) races.push([{g:'Races', label:`${cand}`, sub:`${title} · ${ELSHORT[eid]}`, run:() => pickRace(eid, cid, 'share', cand)}, 4 + Math.log10(ballots + 1)]);
    else { const s = score(title); if (s > 1) races.push([{g:'Races', label:title, sub:ELSHORT[eid], run:() => pickRace(eid, cid, 'lead')}, s + Math.log10(ballots + 1) / 3]); }
  }
  return [...hits.filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 4), ...races.sort((a, b) => b[1] - a[1]).slice(0, 4)].map(([it]) => it);
}
function renderSuggest(items, note) {
  qItems = items; qActive = items.length ? 0 : -1;
  if (!q.value.trim()) { qList.hidden = true; q.setAttribute('aria-expanded', 'false'); return; }
  let g = '', html = '';
  items.forEach((it, i) => { if (it.g !== g) { g = it.g; html += `<li class="grp" role="presentation">${esc(g)}</li>`; } html += `<li class="opt" role="option" id="qo${i}" aria-selected="${i === qActive}" data-i="${i}"><span><span class="lab">${esc(it.label)}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}</span>${it.tag ? `<span class="tag">${esc(it.tag)}</span>` : ''}</li>`; });
  if (note) html += `<li class="none">${note}</li>`;
  else if (!items.length) html += '<li class="none">No match. Try a street address, “Council 28”, “23001”, a ZIP code, a name, or a topic like “evictions”.</li>';
  qList.innerHTML = html; qList.hidden = false; q.setAttribute('aria-expanded', 'true');
  $$('#qList [data-i]').forEach(li => li.addEventListener('mousedown', e => { e.preventDefault(); pick(+li.dataset.i); }));
}
function pick(i) { const it = qItems[i]; if (!it) return; qList.hidden = true; q.setAttribute('aria-expanded', 'false'); q.blur(); if (it.g !== 'Addresses') q.value = ''; it.run(); }
q.addEventListener('input', () => {
  const text = q.value.trim(); clearTimeout(qTimer); if (qAbort) qAbort.abort();
  const local = [...placeMatches(text), ...topicMatches(text)];
  const looksAddress = text.length >= 4 && /\d/.test(text) && /[a-z]/i.test(text) && !LEVEL_WORDS.some(([re]) => re.test(text));
  if (!looksAddress) { renderSuggest(local); return; }
  renderSuggest(local, 'Looking up addresses');
  qTimer = setTimeout(async () => {
    qAbort = new AbortController();
    try {
      const r = await fetch('https://geosearch.planninglabs.nyc/v2/autocomplete?text=' + encodeURIComponent(text), {signal:qAbort.signal});
      const d = await r.json();
      const addrs = (d.features || []).slice(0, 5).map(f => ({g:'Addresses', label:f.properties.name, sub:[f.properties.neighbourhood || f.properties.locality, f.properties.borough, f.properties.postalcode].filter(Boolean).join(', '),
        run:() => gotoAddress(f.properties.label || f.properties.name, f.geometry.coordinates[1], f.geometry.coordinates[0], f.properties.postalcode)}));
      if (q.value.trim() === text) renderSuggest([...addrs, ...local]);
    } catch (e) { if (e.name !== 'AbortError' && q.value.trim() === text) renderSuggest(local, IN_PREVIEW ? 'Address search works on the published site. Districts, ZIP codes, names and topics work here.' : 'Address search isn’t responding. Try again in a moment.'); }
  }, 220);
});
q.addEventListener('keydown', e => {
  if (qList.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if (!qItems.length) return;
    qActive = (qActive + (e.key === 'ArrowDown' ? 1 : -1) + qItems.length) % qItems.length;
    $$('#qList [data-i]').forEach(li => li.setAttribute('aria-selected', +li.dataset.i === qActive));
    q.setAttribute('aria-activedescendant', 'qo' + qActive);
  } else if (e.key === 'Enter') { e.preventDefault(); if (qActive >= 0) pick(qActive); }
  else if (e.key === 'Escape') qList.hidden = true;
});
q.addEventListener('blur', () => setTimeout(() => { qList.hidden = true; q.setAttribute('aria-expanded', 'false'); }, 150));
q.addEventListener('focus', () => { if (q.value.trim() && !state.addr) q.dispatchEvent(new Event('input')); });

// ---------- dialogs, share, theme ----------
$$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
$('#aboutBtn').addEventListener('click', async () => {
  $('#reachList').innerHTML = ['sd','cd'].flatMap(k => Object.entries(reach[k]).filter(([, r]) => r.nyc_share < 100).map(([id, r]) => `<li><b>${unitLong(k, id)}:</b> ${r.nyc_share}% of residents live in NYC. The rest are in ${esc(r.outside)}.</li>`)).join('');
  if (IN_PREVIEW) $('#dlEverything').textContent = 'The published site offers the full CSV bundle and SQLite database. Here, use the Download buttons in a place’s profile, the comparison table, or the race card.';
  $('#aboutDlg').showModal();
  try { await loadConds(); $('#condWindows').textContent = 'Latest windows: ' + Object.values(CONDS.sources).map(s => `${s.label}, ${monYr(s.start)} to ${monYr(s.end)}`).join('; ') + `. Last updated ${CONDS.updated.slice(0, 10)}.`; } catch (e) {}
});
let toastTimer;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2800); }
$('#shareBtn').addEventListener('click', async () => {
  writeHash();
  try { await navigator.clipboard.writeText(location.href); toast('Link copied. It opens this exact view.'); }
  catch (e) { toast('Copy the address bar to share this view.'); }
});
const onTheme = () => { readTheme(); setTiles(); refreshMap(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
new MutationObserver(onTheme).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
document.addEventListener('click', async e => {
  const a = e.target.closest('a[download]'); if (!a || !IN_PREVIEW) return;
  e.preventDefault(); toast('The full dataset downloads from the published site.');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.focus && !document.querySelector('dialog[open]') && document.activeElement !== q) clearFocus(); });

// ---------- start ----------
try {
  await needLevel(state.level);
  await needMetric(state.metric);
  if (!levelsFor(state.metric).includes(state.level)) { state.level = levelsFor(state.metric)[0]; await needLevel(state.level); }
} catch (e) { state.metric = 'dem'; state.level = 'cc'; }
if (state.focus) await needLevel(state.focus.lvl).catch(() => { state.focus = null; });
if (state.focus && state.focus.lvl !== state.level) state.focus = null;
state.cmp[state.level] = state.cmp[state.level].filter(id => AGG[state.level].has(id));
$('#loading').remove();
renderLineToggles();
for (const k of state.lines) setLine(k, true);
for (const k of state.polls) setPolls(k, true);
refreshMap(); renderTray(); renderSheet();
if (state.focus) { const l = layerById.get(state.focus.id); if (l) fitTo(l.getBounds(), 14); }
else if (state.cmp[state.level].length) { const ls = state.cmp[state.level].map(id => layerById.get(id)).filter(Boolean); if (ls.length) fitTo(L.featureGroup(ls).getBounds(), 14); }
// warm the rest in the background so profiles open instantly
const idle = window.requestIdleCallback || (f => setTimeout(f, 400));
idle(() => { loadCensus().then(() => { if (state.focus) renderSheet(); }).catch(() => null); loadDoors().catch(() => null); loadPolls().catch(() => null); });
})();
