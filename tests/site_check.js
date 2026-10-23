// Does the site show what the build files say? Opens places in a real browser, reads the numbers off the page,
// and compares them with the Python-built CSVs in out/ (a separate code path from app.js and core.js).
// Needs playwright (npm i -D playwright) and the site served locally: npm run serve, then npm run test:site.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const O = (process.env.OUT_DIR || path.join(__dirname, '..', 'out')) + '/';
const BASE = process.env.SITE_URL || 'http://localhost:8000';
function csv(f) {
  const t = fs.readFileSync(O + f, 'utf8').replace(/^﻿/, ''); const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c; }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const h = rows[0]; return rows.slice(1).filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
const by = (rows, k) => Object.fromEntries(rows.map(r => [r[k], r]));
const FILE = {cc:'council', ad:'assembly', sd:'senate', cd:'congressional', boro:'borough'};
const ENR = {}; for (const l in FILE) ENR[l] = by(csv(`enrollment_by_${FILE[l]}.csv`), 'district');
ENR.ed = by(csv('election_districts_enrollment.csv'), 'elect_dist');
const KEY = {cc:'council_district', ad:'assembly_district', sd:'senate_district', cd:'congressional_district', boro:'borough', ed:'elect_dist'};
const LVN = {cc:'council', ad:'assembly', sd:'senate', cd:'congressional', boro:'borough', ed:'election_district'};
const CV = {}, HM = {}, CO = {}, CE = {};
for (const l in KEY) { CV[l] = by(csv(`eligible_voters_by_${LVN[l]}.csv`), KEY[l]); HM[l] = by(csv(`homes_by_${LVN[l]}.csv`), KEY[l]); CO[l] = by(csv(`conditions_by_${LVN[l]}.csv`), KEY[l]);
  CE[l] = by(csv(`census_by_${l === 'ed' ? 'election_district' : FILE[l]}.csv`), l === 'ed' ? 'elect_dist' : KEY[l]); }
const REPS = csv('representatives.csv'); const FUND = by(csv('council_funding_fy2027_by_district.csv'), 'council_district');
const COND = [['311_total','All 311 requests','pop'],['311_heat','No heat or hot water','hu'],['hpd_total','Housing code violations','hu'],['evict_evict','Evictions','hu'],['nypd_total','All crime complaints','pop'],['nypd_violent','Violent felonies','pop']];
const n = s => +String(s).replace(/[^0-9.\-]/g, '');
const money = x => Math.abs(x) >= 1e6 ? '$' + (x / 1e6).toFixed(Math.abs(x) >= 1e7 ? 1 : 2) + 'M' : Math.abs(x) >= 1e4 ? '$' + Math.round(x / 1e3) + 'k' : '$' + Math.round(x).toLocaleString('en-US');
const PLACES = [['cc',1],['cc',8],['cc',14],['cc',28],['cc',33],['cc',39],['cc',45],['cc',50],['cc',51],['ad',36],['ad',58],['ad',72],['ad',87],['sd',12],['sd',22],['sd',34],['cd',10],['cd',15],['cd',3],
  ['ed',23001],['ed',36042],['ed',65010],['ed',72030],['ed',81001],['boro','Bronx'],['boro','Staten Island']];
let checks = 0; const bad = [];
const eq = (what, got, want, tol = 0) => { checks++; if (!(Math.abs(got - want) <= tol)) bad.push(`${what}: site ${got}, build ${want}`); };
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_ARGS ? {args: process.env.CHROMIUM_ARGS.split(' ')} : {});
  const p = await b.newPage({viewport:{width:1440, height:900}});
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  const T = s => p.$eval(s, e => e.innerText).catch(() => '');
  for (const [lvl, id] of PLACES) {
    const tag = `${lvl} ${id}`;
    await p.goto(`${BASE}/index.html?c=${Math.random()}#view=${lvl}&color=dem&place=${lvl}:${encodeURIComponent(id)}`);
    await p.waitForSelector('#sheetTabs [data-tab="voters"]', {timeout:30000});
    await p.waitForFunction(() => /Eligible voters\n[\d,]+/.test(document.querySelector('#sheetBody').innerText), null, {timeout:30000}).catch(() => {});
    const tiles = await p.$$eval('#sheetBody .tile', ts => Object.fromEntries(ts.map(t => [t.querySelector('.k') && t.querySelector('.k').innerText, t.querySelector('.v') && t.querySelector('.v').innerText])));
    const e = ENR[lvl][String(id)], cv = CV[lvl][String(id)], hm = HM[lvl][String(id)], ce = CE[lvl][String(id)];
    eq(`${tag} registered voters`, n(tiles['Registered voters']), +e.total_total);
    eq(`${tag} eligible voters`, n(tiles['Eligible voters']), Math.round(+cv.eligible_voters_cvap));
    eq(`${tag} homes`, n(tiles['Homes']), Math.round(+hm.residential_units), 1);
    const inc = +ce.median_household_income; eq(`${tag} median income`, n(tiles['Median household income']), Math.round(inc / 100) * 100);
    if (['cc','ad','sd','cd'].includes(lvl)) { const r = REPS.find(x => x.level === lvl && x.district === String(id)); const nm = (await T('#sheetBody .rep .name')); checks++; if (!nm.startsWith(r.name === '' ? 'Vacant' : r.name)) bad.push(`${tag} rep: site "${nm}", build "${r.name}"`); }
    await p.click('#sheetTabs [data-tab="voters"]'); await p.waitForTimeout(300);
    const st = await p.$$eval('#sheetBody .stat', ss => ss.map(s => [s.querySelector('span').innerText, s.querySelector('b').innerText]));
    for (const [lab, col] of [['Democrats','dem_total'],['Republicans','rep_total'],['No party','blank_total'],['Working Families','wor_total']]) { const row = st.find(x => x[0] === lab); eq(`${tag} ${lab}`, n(row[1].split(/\s/)[0]), +e[col]); }
    if (lvl !== 'boro' || true) {
      await p.click('#sheetTabs [data-tab="conditions"]'); await p.waitForSelector('#sheetBody .cmpbar', {timeout:30000});
      const rows = await p.$$eval('#sheetBody .cmpbar', rs => rs.map(r => [r.querySelector('span').childNodes[0].textContent, r.querySelector('small').innerText, r.querySelector('b').innerText]));
      const co = CO[lvl][String(id)];
      for (const [k, lab, per] of COND) {
        const row = rows.find(x => x[0] === lab); const cnt = +co[k];
        eq(`${tag} ${lab} count`, n(row[1].split(' in ')[0]), Math.round(cnt), 1);
        const den = per === 'hu' ? +hm.housing_units_2020_census : +hm.population_2020_census;
        if (den >= (per === 'hu' ? 100 : 200)) { const r = cnt / den * 1000; eq(`${tag} ${lab} rate`, n(row[2]), r >= 100 ? Math.round(r) : Math.round(r * 10) / 10, r >= 100 ? 1 : 0.11); }
      }
    }
    if (lvl === 'cc') {
      await p.click('#sheetTabs [data-tab="money"]'); await p.waitForSelector('#sheetBody .tile', {timeout:30000});
      const t2 = await p.$$eval('#sheetBody .tile', ts => Object.fromEntries(ts.map(t => [t.querySelector('.k').innerText, t.querySelector('.v').innerText])));
      checks++; if (t2['Designated'] !== money(+FUND[String(id)].total)) bad.push(`${tag} funding: site ${t2['Designated']}, build ${money(+FUND[String(id)].total)}`);
    }
  }
  // the per-place CSV download carries the same numbers as the bundle
  await p.goto(`${BASE}/index.html#view=cc&color=dem&place=cc:28`); await p.waitForSelector('#dlPlace');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dlPlace')]);
  const dlPath = await dl.path(); const txt = fs.readFileSync(dlPath, 'utf8'); const tmp = path.join(os.tmpdir(), 'opennyc_dl_cc28.csv'); fs.writeFileSync(tmp, txt);
  const row = csv(path.relative(O, tmp))[0], ce = CE.cc['28'];
  for (const k of ['median_household_income','renters_pct','born_outside_the_u_s_pct','eligible_voters_cvap','homes','311_total_count']) {
    const want = k === 'eligible_voters_cvap' ? CV.cc['28'].eligible_voters_cvap : k === 'homes' ? HM.cc['28'].residential_units : k === '311_total_count' ? CO.cc['28']['311_total'] : ce[k];
    if (row[k] === undefined) { bad.push(`download has no column ${k}`); continue; }
    eq(`download cc28 ${k}`, +row[k], +want, k === 'homes' ? 0.5 : (+want) * 0.001 + 0.06);
  }
  console.log(`${checks} site-vs-build checks, ${bad.length} differ`); bad.slice(0, 40).forEach(x => console.log('  ' + x));
  console.log('page errors', errs.length, errs.slice(0, 3));
  await b.close(); process.exit(bad.length || errs.length ? 1 : 0);
})();
