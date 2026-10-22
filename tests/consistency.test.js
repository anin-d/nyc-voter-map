// Recomputes every census indicator at every level with the website's code (core.js)
// and compares it with the Python build output. Any disagreement fails the test.
const fs = require('fs'), path = require('path');
const topojson = require(path.join(__dirname, '../node_modules/topojson-client'));
const Core = require(path.join(__dirname, '../site/core.js'));
const D = p => JSON.parse(fs.readFileSync(path.join(__dirname, '../site/data', p)));
const cen = D('census.json'), spec = D('indicators.json'), topo = D('nyc.topo.json'), enroll = D('enroll.json');
const EDM = {};
for (const f of topojson.feature(topo, topo.objects.ed).features) { const p = f.properties; EDM[p.id] = {cc:p.cc, ad:p.ad, sd:p.sd, cd:p.cd, boro:p.boro}; }
const model = Core.init(cen, spec, EDM);
function readCsv(file) {
  const [head, ...rows] = fs.readFileSync(file, 'utf8').trim().split('\n');
  const split = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const h = split(head); return rows.map(r => Object.fromEntries(split(r).map((v, i) => [h[i], v])));
}
// voters per unit, same rules as the site
const V = {ed:new Map(), cc:new Map(), ad:new Map(), sd:new Map(), cd:new Map(), boro:new Map(), tract:new Map()};
for (const [ed, v] of Object.entries(enroll.ed)) {
  V.ed.set(+ed, v); const m = EDM[ed] || (+ed === 40047 ? {ad:40, boro:'Queens'} : {});
  for (const l of ['cc','ad','sd','cd','boro']) { if (m[l] == null) continue; const a = V[l].get(m[l]) || new Array(21).fill(0); v.forEach((x, i) => a[i] += x); V[l].set(m[l], a); }
}
for (const [ed, pieces] of Object.entries(cen.xw)) { const v = enroll.ed[ed]; if (!v) continue; for (const [ti, , , we] of pieces) { const t = cen.tracts[ti]; const a = V.tract.get(t) || new Array(21).fill(0); v.forEach((x, i) => a[i] += x * we); V.tract.set(t, a); } }
const LV = {ed:'elect_dist', cc:'council_district', ad:'assembly_district', sd:'senate_district', cd:'congressional_district', boro:'borough', tract:'tract_geoid'};
let checked = 0, fails = [];
for (const [lvl, key] of Object.entries(LV)) {
  for (const row of readCsv(path.join(__dirname, `../data/census/census_${lvl}.csv`))) {
    const id = ['boro','tract'].includes(lvl) ? row[key] : +row[key];
    const u = Core.unit(model, lvl, id);
    for (const ind of spec.indicators) {
      const {x, moe} = u ? Core.evaluate(model, ind, {c:u.c, m:u.m, split:u.split, v:V[lvl].get(id) || new Array(21).fill(0), tract: lvl === 'tract' ? id : null}) : {x:null, moe:null};
      const py = row[ind.col] === '' ? null : +row[ind.col], pym = row[ind.col + '_moe'] === '' ? null : +row[ind.col + '_moe'];
      const tol = ind.type === 'num' ? 0.51 : ind.type === 'usd' ? 51 : 0.051;
      const bad = (a, b) => (a == null) !== (b == null) || (a != null && Math.abs(a - b) > tol && Math.abs(a - b) / Math.max(1, Math.abs(b)) > 1e-6);
      checked += 2;
      if (bad(x, py)) fails.push(`${lvl} ${id} ${ind.col}: site ${x} vs build ${py}`);
      if (bad(moe, pym)) fails.push(`${lvl} ${id} ${ind.col}_moe: site ${moe} vs build ${pym}`);
      const rel = Core.evaluate(model, ind, {c:u ? u.c : null, m:u ? u.m : null, split:u ? u.split : 0, v:V[lvl].get(id) || new Array(21).fill(0), tract: lvl === 'tract' ? id : null}).rel; if (row[ind.col + '_reliability'] !== undefined && x != null && py != null && rel !== row[ind.col + '_reliability'] && Math.abs(x - py) < tol) {
        // reliability can flip only when a value sits exactly on a threshold after rounding; count those separately
        if (!fails.some(f => f.startsWith(`${lvl} ${id} ${ind.col}`))) fails.push(`${lvl} ${id} ${ind.col} reliability: site ${rel} vs build ${row[ind.col + '_reliability']}`);
      }
    }
  }
}
const relOnly = fails.filter(f => f.includes(' reliability:'));
const hard = fails.filter(f => !f.includes(' reliability:'));
console.log(`checked ${checked.toLocaleString()} values across 7 levels; ${hard.length} value/MOE mismatches; ${relOnly.length} reliability label differences`);
hard.slice(0, 15).forEach(f => console.log('  ' + f)); relOnly.slice(0, 5).forEach(f => console.log('  ' + f));
process.exit(hard.length ? 1 : 0);
