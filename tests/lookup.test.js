// Address lookup accuracy: place every populated 2020 block center with the site's simplified boundaries
// and compare with full-detail boundaries (computed in Python).
const fs = require('fs'), path = require('path');
const topojson = require(path.join(__dirname, '../node_modules/topojson-client'));
const Core = require(path.join(__dirname, '../site/core.js'));
const D = p => JSON.parse(fs.readFileSync(path.join(__dirname, '../site/data', p)));
const topo = D('nyc.topo.json'), tt = D('tracts.topo.json');
const eds = topojson.feature(topo, topo.objects.ed).features, tracts = topojson.feature(tt, tt.objects[Object.keys(tt.objects)[0]]).features;
const pts = JSON.parse(fs.readFileSync(path.join(__dirname, 'block_points.json')));
let n = 0, edBad = 0, edBadPop = 0, trBad = 0, trBadPop = 0, pop = 0;
for (const [x, y, ed, tr, p] of pts) {
  if (ed == null || tr == null) continue;
  n++; pop += p;
  const e = Core.findIn(eds, x, y, f => f.properties.id); if (e !== ed) { edBad++; edBadPop += p; }
  const t = Core.findIn(tracts, x, y, f => f.properties.GEOID); if (t !== tr) { trBad++; trBadPop += p; }
}
console.log(`blocks ${n.toLocaleString()}: ED mismatches ${edBad} (${(edBadPop / pop * 100).toFixed(3)}% of residents), tract mismatches ${trBad} (${(trBadPop / pop * 100).toFixed(3)}% of residents)`);
process.exit(edBadPop / pop > 0.001 || trBadPop / pop > 0.001 ? 1 : 0);
