(async function () {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n == null || !isFinite(n) ? '–' : Math.round(n).toLocaleString('en-US');
const pf = (n, d = 1) => n == null || !isFinite(n) ? '–' : n.toFixed(d) + '%';
const usd = n => n == null || !isFinite(n) ? '–' : '$' + fmt(n);
const IN_PREVIEW = !!(window.claude && typeof window.claude.use === 'function');

// ---------- vocabulary: voters ----------
const PARTIES = ['dem','rep','con','wor','oth','blank'];
const PNAME = {dem:'Democrats', rep:'Republicans', con:'Conservatives', wor:'Working Families', oth:'Other parties', blank:'No party'};
const PABBR = {dem:'Dem', rep:'Rep', con:'Cons.', wor:'WFP', oth:'Other', blank:'No party'};
const PCOL = {dem:'#2e5fae', rep:'#cc5446', con:'#e09030', wor:'#9b4a85', oth:'#529c5a', blank:'#9a92ad'};
const STATUS_WORD = ['voters', 'active voters', 'inactive voters'];
const LEVELS = {
  cc:  {name:'City Council District', plural:'City Council districts', short:'Council', abbr:'CC', file:'council',
        caption:'New York City’s 51 City Council districts. Click one to see who lives and votes there.'},
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
  boro:{name:'Borough', plural:'boroughs', short:'', abbr:'', file:'borough', caption:'The five boroughs.'}
};
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
  reg:['#f3eef6','#e0d2ea','#c7aed9','#a786c2','#8562a6','#644585','#462e61']
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
  ed:[[[23001,23002,23003],'EDs 23001 to 23003']], tract:[], boro:[[['Queens','Brooklyn'],'Queens and Brooklyn']]
};

// ---------- vocabulary: residents (ACS) ----------
const CATS = [
  {k:'key', label:'Key numbers'}, {k:'people', label:'Age and citizenship'}, {k:'race', label:'Race and ethnicity'},
  {k:'origin', label:'Origins'}, {k:'lang', label:'Language and immigration'}, {k:'money', label:'Money and work'},
  {k:'housing', label:'Housing'}, {k:'edu', label:'Education and service'}
];
let CI = [], CIK = {}, RACE = [];   // filled from data/indicators.json (shared with the build)
const KEY_SET = ['cvap','reg','hisp','nhblack','nhasian','nhwhite','med_inc','pov','renter','lep_hh','fborn','ba_plus','age65p','moved20'];
const catItems = cat => cat === 'key' ? KEY_SET.map(k => CIK[k]) : CI.filter(c => c.cat === cat);
const isCensus = m => m.startsWith('c:');
const cKey = m => m.slice(2);

// ---------- data ----------
let topo, enroll, hoods, labels, reach, cen, tractTopo, tractLabels, spec;
try {
  [topo, enroll, hoods, labels, reach, cen, tractTopo, tractLabels, spec] = await Promise.all(
    ['nyc.topo.json','enroll.json','hoods.json','labels.json','reach.json','census.json','tracts.topo.json','tract_labels.json','indicators.json'].map(f =>
      fetch('data/' + f).then(r => { if (!r.ok) throw new Error(f); return r.json(); })));
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

// census math lives in core.js (shared with the test suite)
const model = CityCore.init(cen, spec, EDM);
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
// voters apportioned to tracts, and the ED pieces of each tract
const TPIECES = new Map();   // tract -> [[ed, w_pop_of_tract, w_ed_to_tract]]
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
const cenUnit = (lvl, id) => CityCore.unit(model, lvl, id);
const CITY = new Array(21).fill(0);
for (const v of Object.values(EDV)) for (let i = 0; i < 21; i++) CITY[i] += v[i];

const sortIds = lvl => [...AGG[lvl].keys()].sort((a, b) => typeof a === 'number' ? a - b : String(a).localeCompare(String(b)));
const partial = (lvl, id) => { const r = reach[lvl] && reach[lvl][id]; return r && r.nyc_share < 100 ? r : null; };
const unitName = (lvl, id) => lvl === 'boro' ? id : lvl === 'tract' ? `Tract ${tractCode(id)}` : `${LEVELS[lvl].short} ${id}`;
const unitLong = (lvl, id) => lvl === 'boro' ? id : lvl === 'tract' ? `Census Tract ${tractCode(id)}, ${tractBoro(id)}` : `${LEVELS[lvl].name} ${id}`;

// ---------- numbers ----------
function metricValue(v, metric, st) {
  const o = st * 7, tot = v[o + 6];
  if (metric === 'total') return tot;
  if (metric === 'inactive') return v[6] ? v[20] / v[6] * 100 : null;
  if (!tot) return null;
  if (metric === 'margin') return (v[o] - v[o + 1]) / tot * 100;
  return v[o + PARTIES.indexOf(metric)] / tot * 100;
}
const ev = (ind, ctx) => CityCore.evaluate(model, ind, ctx);
const cval = (ind, ctx) => ev(ind, ctx).x;
const REL_TEXT = {medium:'Medium reliability: the margin of error is 15 to 30% of the estimate, or the area is mostly split from larger census tracts.', low:'Low reliability: the margin of error is large compared with the estimate. Treat as a rough sign only.'};
const relBadge = rel => rel === 'medium' || rel === 'low' ? `<span class="rel rel-${rel}" title="${REL_TEXT[rel]}">${rel === 'low' ? 'low reliability' : 'medium'}</span>` : '';
const relSlot = rel => `<span class="relslot">${rel === 'medium' || rel === 'low' ? `<i class="reldot rel-${rel}" title="${REL_TEXT[rel]}"></i><span class="sr">${rel} reliability</span>` : ''}</span>`;
const fmtMoe = (ind, m) => m == null || !isFinite(m) ? '' : ind.type === 'num' ? '±' + fmt(m) : ind.type === 'usd' ? '±' + usd(Math.round(m / 100) * 100) : ind.type === 'reg' ? '±' + m.toFixed(0) : '±' + m.toFixed(1);
const fmtC = (ind, x) => x == null ? 'Too few residents' : ind.type === 'num' ? fmt(x) : ind.type === 'usd' ? (x === 200000 ? '$200,000+' : x >= 250001 ? '$250,000+' : usd(Math.round(x / 100) * 100)) : ind.type === 'reg' ? x.toFixed(0) : pf(x);
const unitCtx = (lvl, id) => { const u = cenUnit(lvl, id); return {c:u ? u.c : null, m:u ? u.m : null, split:u ? u.split : 0, v:AGG[lvl].get(id) ? AGG[lvl].get(id).v : null, tract: lvl === 'tract' ? id : null}; };
const cityCtx = () => ({c:model.city.c, m:model.city.m, split:0, v:CITY});
const gap = x => x == null ? '–' : Math.abs(x) < .05 ? 'Even' : (x > 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1);
const fmtMetric = (m, x) => x == null ? 'No voters' : m === 'total' ? fmt(x) : m === 'margin' ? gap(x) : pf(x);
const share = (v, st, i) => v[st * 7 + 6] ? v[st * 7 + i] / v[st * 7 + 6] * 100 : null;
function mapRel(lvl, id) { return isCensus(state.metric) ? ev(CIK[cKey(state.metric)], unitCtx(lvl, id)).rel : ''; }
function mapValue(lvl, id) {
  if (isCensus(state.metric)) return cval(CIK[cKey(state.metric)], unitCtx(lvl, id));
  const u = AGG[lvl].get(id); return u ? metricValue(u.v, state.metric, state.status) : null;
}
const metricTitle = m => {
  if (isCensus(m)) { const i = CIK[cKey(m)]; return i.type || !i.den ? i.label : `${i.label}, share ${i.unit || 'of residents'}`; }
  return m === 'total' ? 'Number of registered voters' : m === 'inactive' ? 'Inactive voters, share of all voters' : m === 'margin' ? 'Democrats minus Republicans' : `${PNAME[m]}, share of voters`;
};

// ---------- state + shareable links ----------
const state = {level:'cc', metric:'dem', status:0, cat:'key', fade:true, lines:new Set(['boro']), sel:{ed:[],cc:[],ad:[],sd:[],cd:[],boro:[],tract:[]}, addr:null};
const STATUS_KEYS = ['all','active','inactive'];
const validMetric = m => METRICS.some(x => x.k === m) || (isCensus(m) && CIK[cKey(m)]);
(function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (LEVELS[h.get('view')]) state.level = h.get('view');
  if (h.get('color') && validMetric(h.get('color'))) state.metric = h.get('color');
  if (isCensus(state.metric)) state.cat = KEY_SET.includes(cKey(state.metric)) ? 'key' : CIK[cKey(state.metric)].cat;
  const s = STATUS_KEYS.indexOf(h.get('voters')); if (s >= 0) state.status = s;
  if (h.has('lines')) state.lines = new Set(h.get('lines').split(',').filter(k => LINE_KINDS.some(l => l.k === k)));
  if (h.get('pick')) state.sel[state.level] = h.get('pick').split(',').map(x => ['boro','tract'].includes(state.level) ? decodeURIComponent(x) : +x).filter(x => AGG[state.level].has(x)).slice(0, 300);
})();
function writeHash() {
  const p = new URLSearchParams();
  p.set('view', state.level); p.set('color', state.metric); p.set('voters', STATUS_KEYS[state.status]);
  p.set('lines', [...state.lines].join(','));
  if (state.sel[state.level].length) p.set('pick', state.sel[state.level].join(','));
  try { history.replaceState(null, '', '#' + p.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')); } catch (e) {}
}

// ---------- color scale ----------
let breaks = [], cols = [];
function computeScale() {
  if (state.metric === 'margin') { breaks = MARGIN_BREAKS; cols = MARGIN_COLS; return; }
  cols = isCensus(state.metric) ? (cKey(state.metric) === 'reg' ? PAL.reg : PAL.census) : PAL[state.metric];
  const vals = [...AGG[state.level].keys()].map(id => mapValue(state.level, id)).filter(x => x != null && (state.metric !== 'total' || x > 0)).sort((a, b) => a - b);
  const n = cols.length; breaks = [];
  const ind = isCensus(state.metric) ? CIK[cKey(state.metric)] : null;
  const nearZero = vals.filter(x => x < .5).length;
  if (ind && !ind.type && nearZero >= vals.length * .2 && vals.length - nearZero >= n) {
    // small groups: most areas have almost none, so give "under 0.5%" its own color and split the rest evenly
    const rest = vals.filter(x => x >= .5); breaks.push(.5);
    for (let i = 1; i < n - 1; i++) breaks.push(rest[Math.min(rest.length - 1, Math.floor(rest.length * i / (n - 1)))]);
  } else {
    for (let i = 1; i < n; i++) breaks.push(vals[Math.min(vals.length - 1, Math.floor(vals.length * i / n))]);
  }
  breaks = breaks.filter((b, i) => b != null && (i === 0 || b > breaks[i - 1]));
  if (breaks.length < n - 1) cols = cols.slice(n - 1 - breaks.length);
}
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function colorFor(x) {
  if (x == null || (state.metric === 'total' && x === 0)) return css('--nodata');
  let i = 0; while (i < breaks.length && x >= breaks[i]) i++;
  return cols[i];
}
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };

// ---------- map ----------
const NYC = [[40.4961, -74.2556], [40.9155, -73.7000]];
const map = L.map('map', {preferCanvas:true, zoomSnap:1, zoomDelta:1, minZoom:9, maxZoom:18, boxZoom:false}).fitBounds(NYC, {padding:[12, 12]});
map.attributionControl.setPrefix(false);
map.createPane('ov').style.zIndex = 420;
map.createPane('tilelabels').style.zIndex = 600;
map.createPane('lbl').style.zIndex = 650;
for (const p of ['ov','tilelabels','lbl']) map.getPane(p).style.pointerEvents = 'none';
const renderer = L.canvas({padding:.4, tolerance:3});
const ovRenderer = L.canvas({padding:.4, pane:'ov'});

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/{style}/MapServer/tile/{z}/{y}/{x}';
const tileOpts = {maxNativeZoom:16, maxZoom:18};
let baseTiles, labelTiles, tileFails = 0, tileOk = 0, hoodFallback = false;
function setTiles() {
  if (baseTiles) map.removeLayer(baseTiles);
  if (labelTiles) map.removeLayer(labelTiles);
  const d = isDark();
  baseTiles = L.tileLayer(ESRI, Object.assign({style: d ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base',
    attribution:'Basemap: Esri, HERE, Garmin, © OpenStreetMap contributors · Voters: NYS Board of Elections · Residents: U.S. Census Bureau ACS 2020–2024 · Lines: NYC Planning'}, tileOpts)).addTo(map);
  labelTiles = L.tileLayer(ESRI, Object.assign({style: d ? 'World_Dark_Gray_Reference' : 'World_Light_Gray_Reference', pane:'tilelabels'}, tileOpts)).addTo(map);
  for (const t of [baseTiles, labelTiles]) {
    t.on('tileload', () => { tileOk++; });
    t.on('tileerror', () => { if (++tileFails > 6 && tileOk === 0 && !hoodFallback) { hoodFallback = true; renderLabels(); } });
  }
}
setTiles();

let fillLayer = null; const layerById = new Map(); let hoverId = null;
const featId = f => state.level === 'ed' ? f.properties.id : state.level === 'tract' ? f.properties.GEOID : f.properties[state.level];
function baseStyle(f) {
  const id = featId(f), x = AGG[state.level].has(id) ? mapValue(state.level, id) : null;
  const selected = state.sel[state.level].includes(id), fine = state.level === 'ed' || state.level === 'tract';
  const faded = state.fade && x != null && mapRel(state.level, id) === 'low';
  return {renderer, fillColor:colorFor(x), fillOpacity: faded ? .22 : .74,
    color: selected ? css('--sel') : (isDark() ? 'rgba(20,24,28,.6)' : 'rgba(255,255,255,.8)'),
    weight: selected ? 3.2 : (fine ? .4 : 1.1), opacity:1};
}
function buildFill() {
  if (fillLayer) map.removeLayer(fillLayer);
  layerById.clear(); computeScale();
  fillLayer = L.geoJSON({type:'FeatureCollection', features:FEAT[state.level]}, {
    style: baseStyle,
    onEachFeature: (f, layer) => {
      const id = featId(f);
      layerById.set(id, layer);
      layer.on('mouseover', () => { hoverId = id; layer.setStyle({weight:2.6, color:css('--sel')}); showHover(id); });
      layer.on('mouseout', () => { if (hoverId === id) hoverId = null; layer.setStyle(baseStyle(f)); showHover(null); });
      layer.on('click', e => { if (e.originalEvent.shiftKey) return; toggleSel(id, true); });
    }
  }).addTo(map);
  bringSelToFront(); renderLegend(); renderLabels();
}
function restyle() { computeScale(); fillLayer.eachLayer(l => l.setStyle(baseStyle(l.feature))); bringSelToFront(); renderLegend(); }
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
function renderLineToggles() {
  $('#lineToggles').innerHTML = LINE_KINDS.map(l =>
    `<button type="button" class="tog" data-k="${l.k}" aria-pressed="${state.lines.has(l.k)}"><span class="ln" style="${l.css};color:${l.style.color === '#1a1e23' ? 'var(--fg)' : l.style.color}"></span>${l.label}</button>`).join('');
  $$('#lineToggles .tog').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k; state.lines.has(k) ? state.lines.delete(k) : state.lines.add(k);
    b.setAttribute('aria-pressed', state.lines.has(k)); setLine(k, state.lines.has(k)); renderLabels(); writeHash();
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
  if ((lvl === 'ed' || lvl === 'tract') && z >= 15) {
    let n = 0;
    for (const [id, [lat, lng]] of Object.entries(labels[lvl])) {
      if (selSet.has(id) || !b.contains([lat, lng])) continue; if (++n > 450) break;
      addLbl(lat, lng, lvl === 'tract' ? tractCode(id) : (z >= 16 ? id : id.slice(2)), 'ed');
    }
  }
  if (hoodFallback && z >= 12 && !((lvl === 'ed' || lvl === 'tract') && z >= 15)) for (const [name, lat, lng] of hoods) if (b.contains([lat, lng])) addLbl(lat, lng, esc(name), 'hood');
  for (const id of state.sel[lvl]) { const p = labels[lvl][String(id)]; if (p) addLbl(p[0], p[1], esc(unitName(lvl, id)), 'sel'); }
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
  return CI.filter(filt).map(i => [i, cval(i, {c})]).filter(([, x]) => x != null && x >= 1).sort((a, b) => b[1] - a[1]).slice(0, n);
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
  const u = AGG[lvl].get(id);
  const boros = [...new Set(u.eds.map(e => EDM[e].boro))];
  return `${fmt(u.eds.length)} election districts${lvl !== 'boro' ? ' · ' + boros.join(', ') : ''}`;
}

// hover card
const Hover = L.Control.extend({options:{position:'topright'}, onAdd() { this._d = L.DomUtil.create('div', 'hovercard'); this._d.hidden = true; return this._d; }});
const hover = new Hover().addTo(map);
function showHover(id) {
  const d = hover._d;
  if (id == null || matchMedia('(hover: none)').matches) { d.hidden = true; return; }
  const lvl = state.level, u = AGG[lvl].get(id), v = u ? u.v : ZERO, st = state.status, c = (cenUnit(lvl, id) || {}).c;
  const picked = state.sel[lvl].includes(id), p = partial(lvl, id), ctx = unitCtx(lvl, id);
  let body;
  if (isCensus(state.metric)) {
    const ind = CIK[cKey(state.metric)];
    const r = ev(ind, ctx);
    body = `<div class="v"><span>${esc(ind.short || ind.label)}</span><b>${fmtC(ind, r.x)} <small class="moe">${fmtMoe(ind, r.moe)}</small></b></div>${r.rel === 'low' || r.rel === 'medium' ? `<div class="hint" style="margin-top:2px">${relBadge(r.rel)}</div>` : ''}${raceBar(c)}
      <div class="d" style="margin-top:6px">${fmt(c ? c[F.pop] : null)} residents · ${fmt(c ? c[F.cvap] : null)} eligible voters · ${fmtC(CIK.med_inc, cval(CIK.med_inc, ctx))} median income</div>`;
  } else {
    body = `<div class="v"><span>${fmt(v[st * 7 + 6])} ${STATUS_WORD[st]}${lvl === 'tract' ? ' (est.)' : ''}</span><b>${fmtMetric(state.metric, metricValue(v, state.metric, st))}</b></div>${pbar(v, st)}${sharesGrid(v, st, ['dem','rep','blank'])}
      <div class="d" style="margin-top:6px">${fmt(c ? c[F.pop] : null)} residents · ${fmtC(CIK.reg, cval(CIK.reg, ctx))} active voters per 100 eligible</div>`;
  }
  d.hidden = false;
  d.innerHTML = `<div class="t">${esc(unitLong(lvl, id))}</div><div class="d">${esc(subLine(lvl, id))}</div>${body}
    ${p ? `<div class="hint">NYC part only (${p.nyc_share}% of district residents)</div>` : ''}
    <div class="hint">${picked ? 'Click to remove from your picks' : 'Click to pick'}</div>`;
}

// legend
const Legend = L.Control.extend({options:{position:'bottomleft'}, onAdd() {
  this._d = L.DomUtil.create('div', 'legend'); L.DomEvent.disableClickPropagation(this._d); L.DomEvent.disableScrollPropagation(this._d); return this._d; }});
const legend = new Legend().addTo(map);
let legendOpen = !matchMedia('(max-width:860px)').matches;
function renderLegend() {
  const m = state.metric, ind = isCensus(m) ? CIK[cKey(m)] : null;
  const f = x => ind ? (ind.type === 'num' ? fmt(x) : ind.type === 'usd' ? '$' + fmt(Math.round(x / 1000)) + 'k' : ind.type === 'reg' ? x.toFixed(0) : x.toFixed(1) + '%')
    : m === 'total' ? fmt(x) : m === 'margin' ? (x === 0 ? '0' : gap(x).replace('.0', '')) : x.toFixed(1) + '%';
  const rows = cols.map((c, i) => {
    const lo = i === 0 ? null : breaks[i - 1], hi = i < breaks.length ? breaks[i] : null;
    const txt = lo == null ? `Under ${f(hi)}` : hi == null ? `${f(lo)} or more` : `${f(lo)} to ${f(hi)}`;
    return `<div class="st"><i style="background:${c}"></i><span>${txt}</span></div>`;
  });
  rows.push(`<div class="st"><i style="background:${css('--nodata')}"></i><span>${ind ? 'Too few residents' : 'No registered voters'}</span></div>`);
  if (ind && state.fade) rows.push(`<div class="st"><i style="background:${cols[Math.floor(cols.length / 2)]};opacity:.3"></i><span>Faded: low reliability</span></div>`);
  let sub = m === 'margin' ? 'D+20 means Democrats outnumber Republicans by 20 points.' : breaks[0] === .5 && ind && !ind.type ? `Lightest color: almost none. The other colors each cover about the same number of ${LEVELS[state.level].plural}.` : `Each color covers about the same number of ${LEVELS[state.level].plural}.`;
  if (ind) sub += ` Census ACS 2020–2024${['tract'].includes(state.level) ? '' : ', split into districts by 2020 population'}.`;
  else if (m !== 'inactive' && state.status) sub += ` Counting ${STATUS_WORD[state.status]} only.`;
  legend._d.innerHTML = `<details ${legendOpen ? 'open' : ''}><summary>${esc(metricTitle(m))}</summary><div class="lsub">${sub}</div><div class="steps">${rows.join('')}</div></details>`;
  legend._d.querySelector('details').addEventListener('toggle', e => { legendOpen = e.target.open; });
}

// ---------- picking ----------
function refreshUnit(id) { const l = layerById.get(id); if (l) l.setStyle(baseStyle(l.feature)); }
function toggleSel(id, fromMap) {
  const a = state.sel[state.level], i = a.indexOf(id);
  if (i >= 0) a.splice(i, 1); else a.push(id);
  refreshUnit(id); if (i < 0) { const l = layerById.get(id); if (l) l.bringToFront(); }
  if (hoverId === id) showHover(id);
  afterSelChange();
  if (fromMap && i < 0 && matchMedia('(max-width:860px)').matches) toast(`${unitName(state.level, id)} picked. Details are below the map.`);
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
    tok = tok.replace(/^(ed|cc|ad|sd|cd|council|assembly|senate|congress|district|tract|#)+/i, '');
    if (!tok) continue;
    if (lvl === 'boro') { const hit = [...AGG.boro.keys()].find(k => k.toLowerCase().startsWith(tok.toLowerCase())); if (hit) out.push(hit); continue; }
    if (lvl === 'tract') { if (/^36\d{9}$/.test(tok)) out.push(tok); continue; }
    const r = tok.match(/^(\d+)-(\d+)$/);
    if (r) { let a = +r[1], b = +r[2]; if (b < a) [a, b] = [b, a]; if (b - a <= 2000) for (let i = a; i <= b; i++) out.push(i); }
    else if (/^\d+$/.test(tok)) out.push(+tok);
  }
  return out;
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
  if (!e.shiftKey || e.button !== 0) return;
  e.stopPropagation(); e.preventDefault();
  boxStart = map.mouseEventToLatLng(e);
  boxRect = L.rectangle([boxStart, boxStart], {color:css('--sel'), weight:1.5, dashArray:'4 3', fillOpacity:.08, interactive:false}).addTo(map);
}, true);
document.addEventListener('mousemove', e => { if (boxRect) boxRect.setBounds([boxStart, map.mouseEventToLatLng(e)]); });
document.addEventListener('mouseup', () => {
  if (!boxRect) return;
  const b = boxRect.getBounds(); map.removeLayer(boxRect); boxRect = null;
  if (b.getNorthEast().equals(b.getSouthWest())) return;
  const ids = Object.entries(labels[state.level]).filter(([, [lat, lng]]) => b.contains([lat, lng])).map(([id]) => ['boro','tract'].includes(state.level) ? id : +id);
  const n = addMany(ids); toast(`Picked ${n} ${n === 1 ? LEVELS[state.level].name.toLowerCase() : LEVELS[state.level].plural}.`);
});

// ---------- step 3: cards ----------
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
  const u = AGG[lvl].get(id), v = u.v, st = state.status, p = partial(lvl, id), ctx = unitCtx(lvl, id);
  let member = '';
  if (lvl === 'ed' && EDM[id]) member = `<div class="member">${EDM[id].boro} · ` + ['cc','ad','sd','cd'].filter(k => EDM[id][k] != null).map(k => `<button type="button" data-goto="${k}:${EDM[id][k]}">${LEVELS[k].short} ${EDM[id][k]}</button>`).join(' · ') + '</div>';
  if (lvl === 'tract') { const m = tractMain(id); member = `<div class="member">${tractBoro(id)} · ` + ['cc','ad','sd','cd'].filter(k => m[k][0]).map(k => `<button type="button" data-goto="${k}:${m[k][0][0]}">${LEVELS[k].short} ${m[k][0][0]}</button>`).join(' · ') + (m.cc.length > 1 || m.ad.length > 1 ? ' <span class="caption">(mostly)</span>' : '') + '</div>'; }
  return `<div class="card">
    <div class="card-head"><div><div class="card-title">${esc(unitLong(lvl, id))}</div>${lvl === 'ed' ? '' : `<div class="card-sub">${esc(lvl === 'tract' ? (TINFO[id] && TINFO[id][0]) || '' : subLine(lvl, id))}</div>`}</div>
      <button type="button" class="x" data-rm="${esc(id)}" aria-label="Remove ${esc(unitName(lvl, id))}">×</button></div>
    ${member}
    <div class="big">${fmt(v[st * 7 + 6])}<small>${STATUS_WORD[st]}${lvl === 'tract' ? ', estimated' : ''}</small></div>
    ${pbar(v, st)}${sharesGrid(v, st)}
    ${p ? `<div class="note">Only part of this district is in NYC (${p.nyc_share}% of its residents). These counts cover that part; the rest is in ${esc(p.outside)}.</div>` : ''}
    ${residentsBlock(ctx, open)}
  </div>`;
}
function compactRow(lvl, id) {
  const v = AGG[lvl].get(id).v, st = state.status;
  return `<div class="card" style="padding:8px 10px;gap:5px"><div class="card-head"><div class="card-title" style="font-size:13px">${esc(unitName(lvl, id))}<span class="card-sub" style="display:inline;margin-left:8px">${fmt(v[st * 7 + 6])} ${STATUS_WORD[st]}</span></div>
    <button type="button" class="x" data-rm="${esc(id)}" aria-label="Remove ${esc(unitName(lvl, id))}">×</button></div>${pbar(v, st)}</div>`;
}
function combined(lvl, ids) {
  const v = new Array(21).fill(0); let n = 0;
  for (const id of ids) { const u = AGG[lvl].get(id); for (let i = 0; i < 21; i++) v[i] += u.v[i]; n += u.eds.length; }
  const k = CityCore.combine(model, lvl, ids);
  return {v, n, c:k.c, ctx:{c:k.c, m:k.m, split:k.split, v}};
}
function renderSel() {
  const lvl = state.level, ids = state.sel[lvl], st = state.status;
  $('#selCount').hidden = !ids.length; $('#selCount').textContent = `${ids.length} picked`;
  if (!ids.length) {
    const ex = (EXAMPLES[lvl] || []).map(([arr, t], i) => `<button type="button" class="ex" data-ex="${i}">${esc(t)}</button>`).join('');
    $('#selBody').innerHTML = `<div class="empty"><p>Click ${LEVELS[lvl].plural} on the map to pick them, or search above. Each one you pick shows up here with its voters and residents, and you can compare them side by side.</p>
      ${ex ? `<div class="examples"><span class="caption" style="align-self:center">Try</span>${ex}</div>` : ''}</div>`;
    $$('#selBody [data-ex]').forEach(b => b.addEventListener('click', () => { addMany(EXAMPLES[lvl][+b.dataset.ex][0]); zoomToSel(); }));
    return;
  }
  let html = '';
  if (ids.length > 1) {
    const {v, n, ctx} = combined(lvl, ids);
    html += `<div class="card combined"><div class="card-head"><div><div class="card-title">All ${ids.length} together</div><div class="card-sub">${lvl === 'tract' ? 'Voter counts estimated' : fmt(n) + ' election districts'}</div></div></div>
      <div class="big">${fmt(v[st * 7 + 6])}<small>${STATUS_WORD[st]}</small></div>${pbar(v, st)}${sharesGrid(v, st)}${residentsBlock(ctx, true)}</div>`;
  }
  html += `<div class="sel-actions">
    <button type="button" class="btn primary" data-act="compare">${ids.length > 1 ? 'Compare in a table' : 'See full numbers'}</button>
    <button type="button" class="btn" data-act="download">Download</button>
    <button type="button" class="btn" data-act="zoom">Zoom to</button>
    <button type="button" class="btn ghost" data-act="clear">Clear</button></div>`;
  html += '<div class="cards">' + ids.map(id => ids.length > 4 ? compactRow(lvl, id) : cardHTML(lvl, id, ids.length === 1)).join('') + '</div>';
  $('#selBody').innerHTML = html;
  $$('#selBody [data-rm]').forEach(b => b.addEventListener('click', () => toggleSel(['boro','tract'].includes(lvl) ? b.dataset.rm : +b.dataset.rm)));
  $$('#selBody [data-goto]').forEach(b => b.addEventListener('click', () => { const [k, v] = b.dataset.goto.split(':'); goTo(k, +v); }));
  $$('#selBody [data-act]').forEach(b => b.addEventListener('click', () => ACTIONS[b.dataset.act]()));
}
function renderTray() {
  const lvl = state.level, n = state.sel[lvl].length;
  $('#tray').hidden = !n;
  $('#trayText').textContent = `${n} ${n === 1 ? LEVELS[lvl].name.replace('City Council District', 'City Council district') : LEVELS[lvl].plural} picked`;
  const narrow = matchMedia('(max-width:860px)').matches;
  $('#trayCompare').textContent = narrow ? (n > 1 ? `Compare ${n}` : 'Full numbers') : (n > 1 ? 'Compare in a table' : 'See full numbers');
}
const ACTIONS = {compare:openCompare, download:() => exportComparison(), zoom:zoomToSel, clear:clearSel};
$('#trayCompare').addEventListener('click', openCompare);
$('#trayDownload').addEventListener('click', () => exportComparison());
$('#trayClear').addEventListener('click', clearSel);
function goTo(lvl, id) {
  if (state.level !== lvl) setLevel(lvl);
  if (!state.sel[lvl].includes(id)) addMany([id]);
  const l = layerById.get(id); if (l) map.flyToBounds(l.getBounds(), {padding:[40, 40], maxZoom:16, duration:.6});
}

// ---------- comparison dialog ----------
function overlapHTML(lvl, u, other, id) {
  const m = new Map(); let tot = 0;
  if (lvl === 'tract' && id) { for (const [ed, wp] of TPIECES.get(id) || []) { const k = EDM[ed] && EDM[ed][other]; if (k == null) continue; m.set(k, (m.get(k) || 0) + wp); tot += wp; } }
  else for (const ed of u.eds) { const k = EDM[ed] && EDM[ed][other]; if (k == null) continue; const v = EDV[ed][6]; m.set(k, (m.get(k) || 0) + v); tot += v; }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `<b>${esc(k)}</b> ${!tot ? 0 : v / tot < .005 ? '<1' : Math.round(v / tot * 100)}%`).join(', ');
}
const openGroups = new Set(['Voters by party', 'At a glance', 'Key numbers']);
function renderCompare() {
  const lvl = state.level, ids = state.sel[lvl], st = state.status, o = st * 7;
  $('#cmpTitle').textContent = ids.length > 1 ? `Comparing ${ids.length} ${LEVELS[lvl].plural}` : ids.length ? unitLong(lvl, ids[0]) : 'Comparison';
  if (!ids.length) { $('#cmpBody').innerHTML = '<p class="caption">Nothing picked.</p>'; return; }
  const columns = ids.map(id => ({id, label:unitName(lvl, id), u:AGG[lvl].get(id), v:AGG[lvl].get(id).v, ctx:unitCtx(lvl, id)}));
  if (ids.length > 1) { const {v, ctx} = combined(lvl, ids); columns.push({label:'All together', v, u:{eds:ids.flatMap(id => AGG[lvl].get(id).eds)}, ctx, combined:true}); }
  const city = {label:'All of NYC', v:CITY, ref:true, u:{eds:[]}, ctx:cityCtx()};
  const all = [...columns, city];
  const bars = all.map(c => `<div class="cmp-bar ${c.ref ? 'ref' : ''}"><div class="nm">${esc(c.label)}</div>${pbar(c.v, st)}<div class="tot">${fmt(c.v[o + 6])}</div></div>`).join('');
  const legendRow = '<div class="plegend">' + PARTIES.map(p => `<span><i style="background:${PCOL[p]}"></i>${PNAME[p]}</span>`).join('') + '</div>';
  const head = `<tr><th>${['All voters', 'Active voters', 'Inactive voters'][st]}${lvl === 'tract' ? ' (est.)' : ''}</th>` + all.map(c => `<th class="${c.ref ? 'ref' : ''}">${esc(c.label)}</th>`).join('') + '</tr>';
  const row = (name, fn, cls = '') => `<tr><td>${name}</td>` + all.map(c => `<td class="${cls} ${c.ref ? 'ref' : ''}">${fn(c)}</td>`).join('') + '</tr>';
  const groups = [];
  const group = (title, rows) => groups.push(`<tbody class="grp" data-g="${esc(title)}"><tr class="group"><td colspan="${all.length + 1}"><button type="button" aria-expanded="${openGroups.has(title)}">${esc(title)}</button></td></tr></tbody><tbody ${openGroups.has(title) ? '' : 'hidden'} data-gb="${esc(title)}">${rows}</tbody>`);
  let r = row('Total', c => `<b>${fmt(c.v[o + 6])}</b>`);
  PARTIES.forEach((p, i) => { r += row(PNAME[p], c => `${fmt(c.v[o + i])}<span class="pct">${pf(share(c.v, st, i))}</span>`); });
  group('Voters by party', r);
  r = row('Dem vs. Rep gap', c => gap(metricValue(c.v, 'margin', st))) + row('Inactive share', c => pf(c.v[6] ? c.v[20] / c.v[6] * 100 : null));
  if (lvl !== 'tract') r += row('Election districts', c => c.ref ? fmt(ED_WITH_VOTERS) : fmt(c.u.eds.length));
  group('At a glance', r);
  for (const cat of CATS) {
    const items = catItems(cat.k);
    group(cat.k === 'key' ? 'Key numbers' : cat.label, items.map(i => row(esc(i.label), c => { const r = ev(i, c.ctx); return `${fmtC(i, r.x)}<span class="pct">${r.moe != null ? fmtMoe(i, r.moe) : ''}</span>${relSlot(r.rel)}`; })).join(''));
  }
  if (lvl === 'ed') {
    group('Where it sits', ['cc','ad','sd','cd','boro'].map(k => row(k === 'boro' ? 'Borough' : LEVELS[k].name.replace(' District', ''), c => c.combined || c.ref ? '' : esc(EDM[c.id] && EDM[c.id][k] != null ? EDM[c.id][k] : '–'))).join(''));
  } else {
    group(lvl === 'tract' ? 'Overlaps (by 2020 residents)' : 'Shares area with (by voters)', ['cc','ad','sd','cd','boro'].filter(k => k !== lvl).map(k => row(k === 'boro' ? 'Borough' : LEVELS[k].short, c => c.ref || c.combined ? '' : overlapHTML(lvl, c.u, k, c.id), 'ov')).join(''));
  }
  $('#cmpBody').innerHTML = `<div class="cmp-bars">${bars}</div>${legendRow}<div class="tablewrap"><table><thead>${head}</thead>${groups.join('')}</table></div>
    <p class="caption" style="margin-top:10px">Residents: U.S. Census Bureau, American Community Survey 2020–2024 5-year estimates. ${lvl === 'tract' ? 'Voter counts for tracts are estimated from overlapping election districts.' : 'Tract estimates are split into districts by 2020 Census population.'} Survey estimates for small areas carry wide margins of error. ± is the 90% margin of error. <i class="reldot rel-medium"></i> medium reliability, <i class="reldot rel-low"></i> low reliability.</p>`;
  $$('#cmpBody .group button').forEach(b => b.addEventListener('click', () => {
    const g = b.closest('tbody').dataset.g, body = $(`#cmpBody tbody[data-gb="${CSS.escape(g)}"]`);
    body.hidden = !body.hidden; b.setAttribute('aria-expanded', !body.hidden); body.hidden ? openGroups.delete(g) : openGroups.add(g);
  }));
  const parts = ids.map(id => [id, partial(lvl, id)]).filter(([, p]) => p);
  $('#cmpNote').textContent = parts.length ? parts.map(([id, p]) => `${unitName(lvl, id)} counts only its NYC part (${p.nyc_share}% of residents).` ).join(' ') : 'Click a section name to open or close it.';
  $('#exAll').textContent = `Download all ${LEVELS[lvl].plural}`;
  $('#exEds').textContent = lvl === 'tract' ? 'Download tract and election district pieces' : 'Download election districts inside';
  $('#exEds').hidden = lvl === 'ed';
}
function openCompare() { renderCompare(); $('#cmpDlg').showModal(); }

// ---------- downloads ----------
const COLS21 = ['total','active','inactive'].flatMap(s => [...PARTIES, 'total'].map(p => `${p}_${s}`));
const csvEsc = x => { const s = x == null ? '' : String(x); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = rows => rows.map(r => r.map(csvEsc).join(',')).join('\r\n') + '\r\n';
const derived = v => [...PARTIES.map((p, i) => v[6] ? (v[i] / v[6] * 100).toFixed(2) : ''), v[6] ? ((v[0] - v[1]) / v[6] * 100).toFixed(2) : '', v[6] ? (v[20] / v[6] * 100).toFixed(2) : ''];
const DER_H = [...PARTIES.map(p => p + '_pct'), 'dem_minus_rep_pts', 'inactive_pct'];
const CEN_H = CI.flatMap(i => [i.col, i.col + '_moe', i.col + '_reliability']).concat(['share_of_residents_from_split_tracts']);
const cenRow = ctx => CI.flatMap(i => { const r = ev(i, ctx); const nd = i.type === 'num' || i.type === 'usd' ? 0 : 1;
  return [r.x == null ? '' : r.x.toFixed(nd), r.moe == null ? '' : r.moe.toFixed(nd), r.rel]; }).concat([ctx.c ? ((ctx.split || 0) * 100).toFixed(1) : '']);
const UNIT_H = ['district_type','district','name','election_districts',...COLS21,...DER_H,'nyc_share_of_residents_pct',...CEN_H];
const unitRow = (lvl, id) => { const u = AGG[lvl].get(id), p = partial(lvl, id);
  return [LEVELS[lvl].name, id, lvl === 'tract' ? unitLong(lvl, id) + (TINFO[id] && TINFO[id][0] ? ' (' + TINFO[id][0] + ')' : '') : unitName(lvl, id), lvl === 'tract' ? '' : u.eds.length,
    ...u.v.map(x => lvl === 'tract' ? x.toFixed(1) : x), ...derived(u.v), p ? p.nyc_share : (lvl === 'sd' || lvl === 'cd' ? 100 : ''), ...cenRow(unitCtx(lvl, id))]; };
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
function exportComparison() {
  const lvl = state.level, ids = state.sel[lvl]; if (!ids.length) return;
  const rows = [UNIT_H, ...ids.map(id => unitRow(lvl, id))];
  if (ids.length > 1) { const {v, n, ctx} = combined(lvl, ids); rows.push(['All picked together', ids.join(' + '), '', lvl === 'tract' ? '' : n, ...v.map(x => Math.round(x)), ...derived(v), '', ...cenRow(ctx)]); }
  rows.push(['All of NYC', 'NYC', '', ED_WITH_VOTERS, ...CITY, ...derived(CITY), '', ...cenRow(cityCtx())]);
  saveCsv(`nyc_${LEVELS[lvl].file}_picked_${STAMP}.csv`, rows);
}
$('#exCmp').addEventListener('click', exportComparison);
$('#exEds').addEventListener('click', () => {
  const lvl = state.level, ids = state.sel[lvl]; if (!ids.length) return;
  if (lvl === 'tract') {
    const rows = [['tract_geoid','tract','election_district','share_of_tract_residents_2020','share_of_ed_residents_2020','council_district','assembly_district','senate_district','congressional_district']];
    for (const t of ids) for (const [ed, wp, we] of TPIECES.get(t) || []) { const m = EDM[ed] || {}; rows.push([t, tractCode(t), ed, wp, we, m.cc, m.ad, m.sd, m.cd]); }
    return saveCsv(`nyc_tract_election_district_pieces_${STAMP}.csv`, rows);
  }
  const rows = [[`picked_${LEVELS[lvl].file}`, 'election_district', 'borough', 'council_district', 'assembly_district', 'senate_district', 'congressional_district', ...COLS21, ...DER_H, ...CEN_H]];
  for (const id of ids) for (const ed of AGG[lvl].get(id).eds) { const m = EDM[ed], v = EDV[ed]; rows.push([id, ed, m.boro, m.cc, m.ad, m.sd, m.cd, ...v, ...derived(v), ...cenRow(unitCtx('ed', ed))]); }
  saveCsv(`nyc_election_districts_in_picked_${LEVELS[lvl].file}_${STAMP}.csv`, rows);
});
$('#exAll').addEventListener('click', () => {
  const lvl = state.level;
  const ids = sortIds(lvl).filter(id => lvl !== 'ed' || AGG.ed.get(id).eds.length || cenUnit('ed', id));
  saveCsv(`nyc_all_${LEVELS[lvl].file}s_${STAMP}.csv`, [UNIT_H, ...ids.map(id => unitRow(lvl, id))]);
});

// ---------- search ----------
const q = $('#q'), qList = $('#qList');
let qItems = [], qActive = -1, qAbort = null, qTimer = null;
const LEVEL_WORDS = [
  [/^(?:city\s*)?council(?:\s*district)?\s*#?\s*(\d{1,2})$|^cc\s*#?\s*(\d{1,2})$/i, 'cc'],
  [/^(?:state\s*)?assembly(?:\s*district)?\s*#?\s*(\d{1,2})$|^ad\s*#?\s*(\d{1,2})$/i, 'ad'],
  [/^(?:state\s*)?senate(?:\s*district)?\s*#?\s*(\d{1,2})$|^sd\s*#?\s*(\d{1,2})$/i, 'sd'],
  [/^congress(?:ional)?(?:\s*district)?\s*#?\s*(\d{1,2})$|^cd\s*#?\s*(\d{1,2})$|^ny\s*-?\s*(\d{1,2})$/i, 'cd'],
  [/^(?:ed|election\s*district)?\s*#?\s*(\d{5})$/i, 'ed']
];
function localMatches(text) {
  const t = text.trim(), out = [];
  for (const [re, lvl] of LEVEL_WORDS) {
    const m = t.match(re); if (!m) continue;
    const id = +(m[1] || m[2] || m[3]);
    if (AGG[lvl].has(id)) out.push({kind:LEVELS[lvl].short, label:unitLong(lvl, id), sub:`${fmt(AGG[lvl].get(id).v[6])} voters · ${subLine(lvl, id)}`, run:() => goTo(lvl, id)});
  }
  if (/^36\d{9}$/.test(t) && AGG.tract.has(t)) out.push({kind:'Tract', label:unitLong('tract', t), sub:(TINFO[t] && TINFO[t][0]) || '', run:() => goTo('tract', t)});
  if (/^\d{1,2}$/.test(t)) for (const lvl of ['cc','ad','sd','cd']) { const id = +t; if (AGG[lvl].has(id)) out.push({kind:LEVELS[lvl].short, label:unitLong(lvl, id), sub:`${fmt(AGG[lvl].get(id).v[6])} voters`, run:() => goTo(lvl, id)}); }
  if (t.length >= 3) for (const b of AGG.boro.keys()) if (b.toLowerCase().startsWith(t.toLowerCase())) out.push({kind:'Borough', label:b, sub:`${fmt(AGG.boro.get(b).v[6])} voters`, run:() => goTo('boro', b)});
  return out.slice(0, 6);
}
function renderSuggest(items, loading, note) {
  qItems = items; qActive = items.length ? 0 : -1;
  if (!q.value.trim()) { qList.hidden = true; q.setAttribute('aria-expanded', 'false'); return; }
  qList.innerHTML = items.map((it, i) => `<li role="option" id="qo${i}" aria-selected="${i === qActive}" data-i="${i}"><span class="kind">${esc(it.kind)}</span><span><span class="lab">${esc(it.label)}</span><br><span class="sub">${esc(it.sub || '')}</span></span></li>`).join('')
    + (loading ? '<li class="none">Looking up addresses…</li>' : note ? `<li class="none">${note}</li>` : (!items.length ? '<li class="none">No match. Try a street address, or “Council 28”, “Assembly 32”, “23001”.</li>' : ''));
  qList.hidden = false; q.setAttribute('aria-expanded', 'true');
  $$('#qList li[data-i]').forEach(li => li.addEventListener('mousedown', e => { e.preventDefault(); pick(+li.dataset.i); }));
}
function pick(i) { const it = qItems[i]; if (!it) return; qList.hidden = true; q.setAttribute('aria-expanded', 'false'); q.blur(); it.run(); }
q.addEventListener('input', () => {
  const text = q.value.trim(); clearTimeout(qTimer); if (qAbort) qAbort.abort();
  const local = localMatches(text);
  if (text.length < 3 || /^\d{1,5}$/.test(text) || /^36\d{9}$/.test(text) || (local.length && local[0].kind !== 'Borough')) { renderSuggest(local, false); return; }
  renderSuggest(local, true);
  qTimer = setTimeout(async () => {
    qAbort = new AbortController();
    try {
      const r = await fetch('https://geosearch.planninglabs.nyc/v2/autocomplete?text=' + encodeURIComponent(text), {signal:qAbort.signal});
      const d = await r.json();
      const addrs = (d.features || []).slice(0, 6).map(f => ({kind:'Address', label:f.properties.name,
        sub:[f.properties.neighbourhood || f.properties.locality, f.properties.borough, f.properties.postalcode].filter(Boolean).join(', '),
        run:() => gotoAddress(f.properties.label || f.properties.name, f.geometry.coordinates[1], f.geometry.coordinates[0])}));
      if (q.value.trim() === text) renderSuggest([...local, ...addrs], false);
    } catch (e) { if (e.name !== 'AbortError' && q.value.trim() === text) renderSuggest(local, false, IN_PREVIEW ? 'Address search works on the published site. Districts and tract numbers work here.' : 'Address search isn’t responding. Try again in a moment.'); }
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
function gotoAddress(label, lat, lng) {
  const ed = findIn(FEAT.ed, lng, lat, f => f.properties.id), tract = findIn(FEAT.tract, lng, lat, f => f.properties.GEOID);
  state.addr = {label, ll:[lat, lng], ed, tract};
  q.value = label;
  const id = state.level === 'tract' ? tract : ed == null ? null : state.level === 'ed' ? ed : EDM[ed][state.level];
  if (id != null && !state.sel[state.level].includes(id)) addMany([id]);
  map.flyTo([lat, lng], Math.max(map.getZoom(), 15), {duration:.7});
  renderAddr(); renderLabels();
  $('#panel').scrollTo({top:0, behavior:'smooth'});
  if (matchMedia('(max-width:860px)').matches) toast('Your districts are listed below the map.');
}
function renderAddr() {
  const a = state.addr, el = $('#addrCard');
  if (!a) { el.hidden = true; return; }
  el.hidden = false;
  if (a.ed == null) {
    el.innerHTML = `<div class="addr"><div class="lab">${esc(a.label)}</div><p class="caption">This spot isn’t inside a mapped election district. It may be in a park, on the water, or outside the city.</p><div><button type="button" class="linkish" id="addrX">Clear address</button></div></div>`;
  } else {
    const m = EDM[a.ed];
    const chips = [['ed', a.ed], ['cc', m.cc], ['ad', m.ad], ['sd', m.sd], ['cd', m.cd], ['tract', a.tract], ['boro', m.boro]].filter(([, v]) => v != null)
      .map(([k, v]) => `<button type="button" class="chip" data-goto="${k}:${esc(v)}" aria-current="${k === state.level}">${esc(k === 'boro' ? v : unitName(k, v))}</button>`).join('');
    el.innerHTML = `<div class="addr"><div><div class="lab">${esc(a.label)}</div><p class="caption">is in these districts. Tap one to view it.</p></div><div class="chips">${chips}</div>
      <p class="caption">Right on a district line? Confirm at <a href="https://findmypollsite.vote.nyc/" target="_blank" rel="noopener">findmypollsite.vote.nyc</a>.</p>
      <div><button type="button" class="linkish" id="addrX">Clear address</button></div></div>`;
    $$('#addrCard [data-goto]').forEach(b => b.addEventListener('click', () => { const [k, v] = b.dataset.goto.split(':'); goTo(k, ['boro','tract'].includes(k) ? v : +v); }));
  }
  $('#addrX').addEventListener('click', () => { state.addr = null; q.value = ''; renderAddr(); renderLabels(); });
}

// ---------- controls ----------
function setLevel(l) {
  state.level = l;
  $$('#levelSeg button').forEach(b => b.setAttribute('aria-checked', b.dataset.l === l));
  $('#levelCaption').textContent = LEVELS[l].caption;
  $('#edFilter').hidden = l !== 'ed';
  $('#addBox').placeholder = l === 'ed' ? '23001, 23005-23010' : l === 'boro' ? 'Queens, Bronx' : l === 'tract' ? '36081044601' : '28, 29, 32';
  $('#addMsg').textContent = '';
  buildFill(); renderSel(); renderTray(); writeHash(); updateResNote();
  if (state.addr) renderAddr();
}
$$('#levelSeg button').forEach(b => b.addEventListener('click', () => setLevel(b.dataset.l)));

// step 2: voters / residents
$('#metricGrid').innerHTML = METRICS.map(m => `<button type="button" role="radio" class="metric" data-m="${m.k}">${m.dot ? `<span class="dot" style="background:${m.dot}"></span>` : `<span class="ramp" style="background:${m.ramp}"></span>`}<span>${m.label}</span></button>`).join('');
$('#catRow').innerHTML = CATS.map(c => `<button type="button" class="cat" data-c="${c.k}">${c.label}</button>`).join('');
function renderCatList() {
  $$('#catRow .cat').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === state.cat));
  $('#cMetricList').innerHTML = catItems(state.cat).map(i => `<button type="button" role="radio" class="cmetric" data-m="c:${i.k}" aria-checked="${state.metric === 'c:' + i.k}" ${i.desc ? `title="${esc(i.desc)}"` : ''}>${i.race ? `<span class="dot" style="background:${i.race}"></span>` : ''}<span>${esc(i.label)}</span></button>`).join('');
  $$('#cMetricList .cmetric').forEach(b => b.addEventListener('click', () => setMetric(b.dataset.m)));
  const cur = isCensus(state.metric) ? CIK[cKey(state.metric)] : null;
  $('#cDesc').textContent = cur && cur.desc ? cur.desc : '';
}
$$('#catRow .cat').forEach(b => b.addEventListener('click', () => { state.cat = b.dataset.c; renderCatList(); }));
function setTab(t) {
  $$('#colorTabs [role=tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.t === t));
  $('#voterPanel').hidden = t !== 'voters'; $('#resPanel').hidden = t !== 'residents';
  updateResNote();
}
function updateResNote() {
  const n = $('#resNote'); if (!n) return;
  n.textContent = state.level === 'ed' ? 'Census numbers for a single election district are split from larger census tracts, so none rate high reliability. Pick several districts, or switch to a district view, for firmer numbers.'
    : state.level === 'tract' ? 'Tracts are the Census Bureau’s own areas, so nothing is split here. Small groups still carry wide margins of error.' : '';
  n.hidden = !n.textContent;
}
$('#fadeLow').addEventListener('change', e => { state.fade = e.target.checked; if (fillLayer) restyle(); });
$$('#colorTabs [role=tab]').forEach(b => b.addEventListener('click', () => {
  setTab(b.dataset.t);
  if (b.dataset.t === 'residents' && !isCensus(state.metric)) setMetric('c:' + catItems(state.cat)[0].k);
  if (b.dataset.t === 'voters' && isCensus(state.metric)) setMetric('dem');
}));
function setMetric(k) {
  state.metric = k;
  $$('#metricGrid .metric').forEach(b => b.setAttribute('aria-checked', b.dataset.m === k));
  renderCatList(); setTab(isCensus(k) ? 'residents' : 'voters');
  if (fillLayer) { restyle(); writeHash(); if (hoverId != null) showHover(hoverId); }
}
$$('#metricGrid .metric').forEach(b => b.addEventListener('click', () => setMetric(b.dataset.m)));
function setStatus(s) {
  state.status = s; $$('#statusSeg button').forEach(b => b.setAttribute('aria-checked', +b.dataset.s === s));
  if (fillLayer) { restyle(); renderSel(); writeHash(); if ($('#cmpDlg').open) renderCompare(); }
}
$$('#statusSeg button').forEach(b => b.addEventListener('click', () => setStatus(+b.dataset.s)));
$('#statusHelpBtn').addEventListener('click', e => { const h = $('#statusHelp'); h.hidden = !h.hidden; e.currentTarget.setAttribute('aria-expanded', !h.hidden); });

// dialogs, share, toast
$$('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
const openAbout = () => $('#aboutDlg').showModal();
$('#aboutBtn').addEventListener('click', openAbout);
$('#aboutBtn2').addEventListener('click', openAbout);
$('#reachList').innerHTML = ['sd','cd'].flatMap(k => Object.entries(reach[k]).filter(([, r]) => r.nyc_share < 100)
  .map(([id, r]) => `<li><b>${unitLong(k, id)}:</b> ${r.nyc_share}% of residents live in NYC. The rest are in ${esc(r.outside)}.</li>`)).join('');
let toastTimer;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600); }
$('#shareBtn').addEventListener('click', async () => {
  writeHash();
  try { await navigator.clipboard.writeText(location.href); toast('Link copied. It opens this exact view.'); }
  catch (e) { toast('Copy the address bar to share this view.'); }
});
const onTheme = () => { setTiles(); restyle(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
new MutationObserver(onTheme).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});

// full-dataset links: in the preview, hand files over through the downloads capability
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
setMetric(state.metric);
setStatus(state.status);
setLevel(state.level);
if (state.sel[state.level].length) zoomToSel();
})();
