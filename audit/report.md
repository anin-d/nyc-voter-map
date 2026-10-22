# NYC Voter Map data audit

## 1. Voter enrollment

- **PASS** Every party count for every ED and status matches the original BOE workbooks, re-read with a second parser (4,026 EDs x 21 cells, 0 differences)
- **PASS** Party columns add to the total in every ED
- **PASS** Active + inactive = total in every ED and party
- **PASS** Citywide registrants (5,359,346)
- **PASS** ED codes unique citywide

## 2. Election district to district assignment (independent geometry)

- **PASS** State Senate: our assignment vs tl_2024_36_sldu.zip (4,214 EDs compared, 2 differ, 0 voters in differing EDs; 0 ED points outside that layer)
- **INFO** State Senate: the 2 differing EDs have no registered voters; they are slivers on a district edge.
- **PASS** Assembly: our assignment vs tl_2024_36_sldl.zip (4,214 EDs compared, 3 differ, 0 voters in differing EDs; 0 ED points outside that layer)
- **INFO** Assembly: the 3 differing EDs have no registered voters; they are slivers on a district edge.
- **PASS** Congress: our assignment vs tl_2024_36_cd119.zip (4,214 EDs compared, 2 differ, 0 voters in differing EDs; 0 ED points outside that layer)
- **INFO** Congress: the 2 differing EDs have no registered voters; they are slivers on a district edge.
- **PASS** City Council: our assignment vs od_council.geojson (4,214 EDs compared, 0 differ, 0 voters in differing EDs; 0 ED points outside that layer)
- **PASS** Assembly district equals the first two digits of every ED code
- **PASS** 2020 Census population by council district: blocks placed directly in council lines vs. through EDs (shoreline blocks snapped to the nearest area in both) (largest gap 0.00%, total 8,804,190 vs 8,804,190)
- **PASS** Council districts are within the legal ±5% population band around the 2020 ideal (tolerance for block-center placement) (range -2.7% to +3.0%)

## 3. Census ACS 2020–2024: parsing and totals

- **PASS** Tract counts re-derived from the raw Census text files with a separate reader (pop 0, cvap 0, hisp 0, renter 0, pov 0, lep_hh 0 mismatches)
- **PASS** Every count field: our five-borough tract sums vs. the Census Bureau county estimates (largest gap 0.0000% (pop))
- **PASS** Citywide tract sums vs. the Census Bureau estimate for New York city (place 3651000) (largest gap 0.0000%, population 8,483,844 vs 8,483,844)
- **PASS** Median income estimated from income brackets vs. the published median, for 7 county/city and 213 NY State district geographies (median gap 0.48%, 90th percentile 1.40%, worst 3.3%)
- **INFO** Our MOE method (root-sum-of-squares over tracts) compared with published county MOEs, ratio ours/published: renter 1.0–1.3x, pov 0.9–1.2x, nhblack 2.6–3.8x. Population and Hispanic totals are controlled by the Bureau at the county level and carry no published margin. Ratios above 1 mean our margins are wider (more cautious) than the Bureau’s, which is the known behavior of the Census-recommended approximation for large areas; reliability labels on big districts therefore lean conservative.

## 4. Census apportioned to districts vs. the Census Bureau’s own district estimates

- **PASS** State Senate: 26 districts fully inside NYC, our tract-split estimates vs. the Bureau’s published district estimates (population: median gap 0.19%, worst 0.67%; shares (Hispanic, Black, Asian, White, foreign born, poverty, renters, limited English, college): worst 0.86 points; median income median gap 0.7%)
- **PASS** Assembly: 65 districts fully inside NYC, our tract-split estimates vs. the Bureau’s published district estimates (population: median gap 0.62%, worst 2.45%; shares (Hispanic, Black, Asian, White, foreign born, poverty, renters, limited English, college): worst 2.03 points; median income median gap 1.2%)
- **PASS** Congress: 11 districts fully inside NYC, our tract-split estimates vs. the Bureau’s published district estimates (population: median gap 0.10%, worst 0.26%; shares (Hispanic, Black, Asian, White, foreign born, poverty, renters, limited English, college): worst 0.26 points; median income median gap 0.2%)
- **INFO** SD 34 crosses the city line: our NYC part has 237,623 residents; the Bureau’s full-district total 303,584 × 80.7% in NYC (2020) = 244,992 (-3.0%).
- **INFO** SD 36 crosses the city line: our NYC part has 238,949 residents; the Bureau’s full-district total 311,373 × 76.8% in NYC (2020) = 239,134 (-0.1%).
- **INFO** CD 3 crosses the city line: our NYC part has 185,069 residents; the Bureau’s full-district total 770,395 × 24.0% in NYC (2020) = 184,894 (+0.1%).
- **INFO** CD 16 crosses the city line: our NYC part has 71,501 residents; the Bureau’s full-district total 775,704 × 9.2% in NYC (2020) = 71,364 (+0.2%).
- **INFO** District margins of error, ours divided by the Bureau’s published margin (median, by field): hisp 1.01x, nhblack 1.02x, pov 0.97x, renter 0.95x. Values near or above 1 mean our reliability labels are as strict or stricter than the Bureau’s.

## 5. The website computes the same numbers as the build

- **PASS** Every census value and margin, recomputed in the browser code (core.js) for all 7 levels, matches the Python build (checked 863,850 values across 7 levels; 0 value/MOE mismatches; 0 reliability label differences)
- **PASS** The SQLite database holds exactly the same numbers as the CSV files
- **PASS** Address lookup with the website’s simplified boundaries places every populated 2020 block in the same ED and tract as full-detail boundaries (blocks 30,680: ED mismatches 0 (0.000% of residents), tract mismatches 0 (0.000% of residents))

## 6. Reliability of the published numbers

- **INFO** council districts: share of indicator values rated high / medium / low reliability: 69% / 17% / 14%
- **INFO** election districts: share of indicator values rated high / medium / low reliability: 1% / 42% / 57%
- **INFO** census tracts: share of indicator values rated high / medium / low reliability: 18% / 19% / 63%
- **INFO** Council districts, key measures rated high reliability: citizens_18plus_cvap 100%, black_non_hispanic_pct 96%, median_household_income 0%, below_the_poverty_line_pct 100%, renters_pct 100%
