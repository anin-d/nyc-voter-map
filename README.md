# NYC Voter Map

Who votes and who lives in every New York City district, for people with no data background. Pick a district type, color the map by party enrollment or by Census measures, click districts to compare them, and download the numbers.

Live site: https://nyc-voter-map.netlify.app

## What's in it

**Voters.** NYS Board of Elections enrollment by election district (ED), party and status, as of February 20, 2026: 5,359,346 registrants in 4,026 EDs.

**Residents.** U.S. Census Bureau American Community Survey 2020–2024 5-year estimates for NYC's 2,327 census tracts: about 65 measures covering eligible voters (CVAP), age, race and ethnicity, 23 origin groups, home languages and limited English, income, poverty, work, housing costs, education and veterans. Every number carries a 90% margin of error and a reliability rating.

**Levels.** Election district, City Council, State Assembly, State Senate, Congress, census tract and borough. Every level can be mapped, compared and exported.

## How the numbers fit together

- EDs nest inside every district type, so district voter totals are exact sums of EDs.
- Census tracts don't line up with EDs. Each tract is split using 2020 Census blocks: person counts follow block population, household counts follow block housing units. Districts are sums of their EDs.
- Margins of error add tract margins, scaled by each unit's share, as a root-sum-of-squares (the Census Bureau's approximation). Share margins use the Bureau's ratio formula.
- Reliability: high when the coefficient of variation is under 15%, medium at 15–30% or when a unit gets most of its residents from split tracts, low above 30%. Margins cover survey sampling only, not the error from splitting.

## How it's checked

`pipeline/audit.py` writes [`audit/report.md`](audit/report.md). Highlights from the current build:

- Voter counts match the BOE workbooks cell for cell, re-read with a second parser, and add to each county's published totals.
- ED district assignments match the Census Bureau's 2024 Senate, Assembly and Congress lines and NYC Open Data's council lines; the only differences are five zero-voter slivers.
- Tract sums equal the Bureau's county and citywide estimates exactly.
- For the 102 Senate, Assembly and Congress districts fully inside NYC, our split-tract estimates match the Bureau's own district estimates: population within 2.5% (median 0.1–0.6%), every share tested within about 2 points, and margins of error at 0.95–1.02 times the Bureau's.
- `tests/consistency.test.js` recomputes all 863,850 published values and margins with the browser code and compares them with the Python build: zero differences.
- `tests/lookup.test.js` checks address lookup on simplified boundaries against full-detail boundaries for every populated 2020 block: zero mismatches.
- `pipeline/run_all.sh` rebuilds everything from source files; a clean rebuild reproduces every site and download file exactly.

## Repo layout

```
site/        the website (static, no build step); Netlify publishes this folder
  core.js    census math shared by the site and the tests
  data/      map and data files the site loads
  downloads/ SQLite database and CSV bundle
pipeline/    Python scripts that build every dataset, plus the audit
tests/       Node tests that hold the site's math to the build's
audit/       latest audit report and detail tables
```

## Rebuilding the data

Source files are not in git. Put them under `raw/`:

- `raw/enrollment/*ed_feb26*.xlsx`: BOE enrollment by ED, one workbook per county
- `raw/ED_user.geojson`: NYC Open Data Election Districts
- `raw/tracts2020.geojson`: DCP 2020 census tracts
- `raw/acs/`: ACS 2024 5-year table-based summary file extracts (NYC tracts, plus `ref/` county, city and district rows)
- `raw/census/`: TIGER 2020 blocks for New York, TIGER 2024 SLDU, SLDL and CD119
- `raw/od_council.geojson`: NYC Open Data council districts (audit only)

Then `npm install` and `bash pipeline/run_all.sh`. Python needs pandas, geopandas, pyogrio, shapely and openpyxl.

## Run the site locally

`npm run serve`, then open http://localhost:8000.

## License

Code: MIT. Data: public records from the sources above.
