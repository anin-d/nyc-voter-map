# Open NYC

Every New York City district, for people with no data background: who votes, how they voted, who lives there, who represents them, what their homes and blocks are like, and where the political money goes. Pick a district type, color the map, click places to see their full profile, compare them side by side, and download the numbers. Search an address to get your districts, representatives and poll site.

Live site: https://nyc-voter-map.netlify.app

## What's in it

**Voters.** NYS Board of Elections enrollment by election district (ED), party and status, as of February 20, 2026: 5,359,346 registrants in 4,026 EDs.

**Residents.** U.S. Census Bureau American Community Survey 2020–2024 5-year estimates for NYC's 2,327 census tracts: about 65 measures covering eligible voters (CVAP), age, race and ethnicity, 23 origin groups, home languages and limited English, income, poverty, work, housing costs, education and veterans. Every number carries a 90% margin of error and a reliability rating.

**Eligible voters.** The Census Bureau's official citizen voting-age population special tabulation (2020–2024) by block group, split into EDs the same way.

**Election results.** NYC BOE certified results by ED for the November 2024 general, June 2025 primary, November 2025 general and June 2026 primary, each on the ED lines in force that day. Ranked-choice rounds for the 2025 primary come from the BOE's cast vote records.

**Representatives.** Council, Assembly, Senate and House members from the official rosters, checked against certified winners and OpenStates; vacancies and mid-term changes are flagged.

**Poll sites.** BOE Election Day and early voting sites for November 3, 2026, by ED, geocoded and distance-checked.

**Homes.** Residential units by ED from PLUTO 26v2, with multi-building complexes split across buildings and NYCHA developments pooled by development.

**Conditions.** 311 requests by category, HPD violations, marshals' evictions and NYPD complaints for July 2025 to June 2026, placed by tax lot or location.

**Money.** NYC Council discretionary funding for fiscal year 2027 by sponsoring district; CFB (2025 city races) and FEC (2025–2026) donations by donor ZIP code.

**Levels.** Election district, City Council, State Assembly, State Senate, Congress, census tract, borough and ZIP code. Every level can be mapped, compared and exported.

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
- Election results: every ED total matches the BOE's certified recaps (27,335 Assembly-level and 14,873 county-level comparisons, zero differences); every ballot in a district race sits in the district the BOE assigned it to; the ranked-choice count reproduces 37 of 38 certified final rounds exactly (the 38th was certified by hand count and is left out).
- Eligible voters: block-group sums are within 0.06% of the Bureau's county CVAP tables; district estimates are within 1.5% of the Bureau's own district CVAP tables.
- Homes: every residential unit is placed; ED totals track 2020 Census housing units (median ED within 2%).
- Poll sites: all 1,274 addresses geocoded; every ED more than 1.5 km from its site has no registered voters.
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
- `raw/cvap/`: Census CVAP special tabulation 2020–2024 (block groups, county and district files)
- `raw/results/`: BOE ED-level results for each election, 2025 primary cast vote records and RCV reports; `raw/ed_vintages/`: DCP ED releases 24a–26c
- `raw/reps/`, `raw/polls/`: official rosters and BOE poll site lists (downloaded by hand; see each script's docstring)
- `raw/pluto/`, `raw/footprints/`, `raw/nycha/`: PLUTO 26v2, building footprints, NYCHA developments and Data Book
- `raw/discretionary/`, `raw/cfb/`, `raw/fec/`, `raw/zip/`: Council funding disclosure, CFB and FEC contributions, MODZCTA areas

Then `npm install` and `bash pipeline/run_all.sh`. Python needs pandas, geopandas, pyogrio, shapely and openpyxl.

### Neighborhood conditions update themselves

`pipeline/conditions_build.py` needs no downloads. It asks NYC Open Data's API how current each source is, takes the
latest 12 complete months of 311 requests, HPD violations, residential evictions and NYPD complaints, and places each
record in an election district (by tax lot where the record has one, otherwise by its coordinates). Every monthly pull
must add up to the API's own count, and a run that finds under 60% of the last run's records stops without writing.

`.github/workflows/conditions.yml` runs it every Monday on the default branch and commits `site/data/conditions.json`
when it changes. Add a `SOCRATA_APP_TOKEN` repository secret to raise the API's rate limit (optional). The lookup files
in `pipeline/ref/` only need rebuilding (`pipeline/conditions_ref.py`) when the ED lines or PLUTO change.

## Run the site locally

`npm run serve`, then open http://localhost:8000.

## License

Code: MIT. Data: public records from the sources above.
