/* City Open core: Census math shared by the website and the test suite.
   Every reporting unit is a set of tract shares. Estimates add tract counts times shares;
   margins of error add tract MOEs times shares as a root-sum-of-squares (Census Bureau approximation). */
(function (root) {
'use strict';
const BR_LO = [0,10000,15000,20000,25000,30000,35000,40000,45000,50000,60000,75000,100000,125000,150000,200000];

// opts.tractOf: for data on areas finer than tracts (block groups), the tract each area sits in
// opts.popField: the head count used for the split share (pop for ACS, cvap for CVAP)
function init(cen, spec, EDM, opts = {}) {
  const F = Object.fromEntries(cen.fields.map((f, i) => [f, i]));
  const NF = cen.fields.length;
  const P = new Set(cen.person_fields);
  const ISP = cen.fields.map(f => P.has(f));
  const TINFO = {}; cen.tracts.forEach((t, i) => { TINFO[t] = cen.tract_info[i]; });
  const W = {tract:new Map(), ed:new Map(), cc:new Map(), ad:new Map(), sd:new Map(), cd:new Map(), boro:new Map()};
  if (opts.tractOf) cen.tracts.forEach((a, i) => { const t = opts.tractOf(a); if (!W.tract.has(t)) W.tract.set(t, new Map()); W.tract.get(t).set(i, [1, 1]); });
  else cen.tracts.forEach((t, i) => W.tract.set(t, new Map([[i, [1, 1]]])));
  const add = (map, ti, wp, wh) => { const o = map.get(ti); if (o) { o[0] += wp; o[1] += wh; } else map.set(ti, [wp, wh]); };
  for (const [ed, pieces] of Object.entries(cen.xw)) {
    const m = new Map(); for (const [ti, wp, wh] of pieces) add(m, ti, wp, wh);
    W.ed.set(+ed, m);
    const mem = EDM[ed]; if (!mem) continue;
    for (const lvl of ['cc','ad','sd','cd','boro']) {
      const key = mem[lvl]; if (key == null) continue;
      if (!W[lvl].has(key)) W[lvl].set(key, new Map());
      const acc = W[lvl].get(key); for (const [ti, wp, wh] of pieces) add(acc, ti, wp, wh);
    }
  }
  const model = {F, NF, ISP, TINFO, W, spec, minDen: spec.min_den, cen, cache:{}, P: F[opts.popField || 'pop']};
  const all = new Map(); cen.tracts.forEach((t, i) => all.set(i, [1, 1]));
  model.city = counts(model, all);
  return model;
}
// estimates and MOEs for one set of tract shares
function counts(model, wmap) {
  const {NF, ISP, cen} = model;
  const c = new Float64Array(NF), m2 = new Float64Array(NF), P = model.P;
  let splitPop = 0;
  for (const [ti, [wp, wh]] of wmap) {
    const ct = cen.counts[ti], mt = cen.moe[ti];
    if (wp < 0.95) splitPop += ct[P] * wp;
    for (let f = 0; f < NF; f++) { const w = ISP[f] ? wp : wh; c[f] += ct[f] * w; const e = mt[f] * w; m2[f] += e * e; }
  }
  return {c, m: m2.map(Math.sqrt), split: c[P] > 0 ? splitPop / c[P] : 0};
}
function unit(model, lvl, id) {
  const key = lvl + ':' + id;
  if (model.cache[key]) return model.cache[key];
  const w = model.W[lvl].get(id); if (!w) return null;
  return (model.cache[key] = counts(model, w));
}
function combine(model, lvl, ids) {
  const m = new Map();
  for (const id of ids) { const w = model.W[lvl].get(id); if (!w) continue; for (const [ti, [wp, wh]] of w) { const o = m.get(ti); if (o) { o[0] += wp; o[1] += wh; } else m.set(ti, [wp, wh]); } }
  return counts(model, m);
}
function medianIncome(model, c) {
  const F = model.F; let tot = 0; const n = [];
  for (let i = 0; i < 16; i++) { const x = c[F['inc' + String(i).padStart(2, '0')]]; n.push(x); tot += x; }
  if (tot < 20) return null;
  let cum = 0; const half = tot / 2;
  for (let i = 0; i < 16; i++) {
    if (cum + n[i] >= half) { if (i === 15) return 200000; return n[i] ? BR_LO[i] + (half - cum) / n[i] * (BR_LO[i + 1] - BR_LO[i]) : BR_LO[i]; }
    cum += n[i];
  }
  return null;
}
// value and margin of error for an indicator. ctx: {c, m, v (voter vector), tract (geoid when a single tract)}
function evaluate(model, ind, ctx) {
  const r = rawEvaluate(model, ind, ctx);
  r.rel = reliability(r.x, r.moe, {split: ctx.split || 0, reg: ind.type === 'reg'});
  return r;
}
function rawEvaluate(model, ind, ctx) {
  const {F, minDen, TINFO} = model, c = ctx.c, m = ctx.m;
  if (!c) return {x:null, moe:null};
  const t = ind.type;
  if (t === 'num') return {x:c[F[ind.num]], moe:m ? m[F[ind.num]] : null};
  if (t === 'usd') {
    const ti = ctx.tract && TINFO[ctx.tract];
    if (ti && ti[2] != null) return {x:ti[2], moe:ti[3]};
    return {x:medianIncome(model, c), moe:null};
  }
  if (t === 'reg') {
    const cv = c[F.cvap]; if (!(cv >= minDen) || !ctx.v) return {x:null, moe:null};
    const x = ctx.v[13] / cv * 100; return {x, moe: m ? x * m[F.cvap] / cv : null};
  }
  const X = c[F[ind.num]], Y = c[F[ind.den]];
  if (!(Y >= minDen)) return {x:null, moe:null};
  const p = X / Y;
  if (!m) return {x:p * 100, moe:null};
  const mX = m[F[ind.num]], mY = m[F[ind.den]];
  let rad = mX * mX - p * p * mY * mY; if (rad < 0) rad = mX * mX + p * p * mY * mY;
  return {x:p * 100, moe:Math.sqrt(rad) / Y * 100};
}
// Reliability from the coefficient of variation (CV = MOE / 1.645 / estimate):
// under 15% high, 15 to 30% medium, over 30% low. Two extra rules for the split:
// a unit that gets most of its residents from split tracts is at best medium, and a registration
// rate above 130 per 100 eligible means the split is off for that area, so it is low.
function reliability(x, moe, opts = {}) {
  if (x == null || moe == null || !isFinite(x) || !isFinite(moe)) return '';
  if (x <= 0) return 'low';
  if (opts.reg && x > 130) return 'low';
  const cv = moe / 1.645 / x * 100;
  let r = cv < 15 ? 'high' : cv < 30 ? 'medium' : 'low';
  if (r === 'high' && opts.split > 0.5) r = 'medium';
  return r;
}
// point in polygon for address lookup (GeoJSON features, [lng, lat])
const bboxCache = new WeakMap();
function bboxOf(f) {
  let b = bboxCache.get(f); if (b) return b; b = [180, 90, -180, -90];
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
  bboxCache.set(f, b); return b;
}
function inRing(x, y, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
function findIn(feats, lng, lat, idOf) {
  for (const f of feats) {
    const b = bboxOf(f); if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys) if (inRing(lng, lat, p[0]) && !p.slice(1).some(h => inRing(lng, lat, h))) return idOf(f);
  }
  return null;
}
const api = {init, counts, unit, combine, evaluate, reliability, medianIncome, findIn};
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CityCore = api;
})(typeof self !== 'undefined' ? self : this);
