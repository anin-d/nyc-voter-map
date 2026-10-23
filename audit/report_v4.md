# Open NYC accuracy audit

Run 2026-10-23 17:38. 0 failed checks.


## A. Election results vs certified recaps

- **PASS** Every candidate line, summed by Assembly district from the published files, equals the certified recap (8,763 AD-by-line comparisons, 0 differ)
- **PASS** Every published contest found its certified recap (37 ranked-choice contests come from the cast vote records and are checked in C; 0 without a recap: [])

## B. Results integrity

- **PASS** Candidate totals, ballots and the search index match the per-ED rows in every contest (0 problems [])

## C. Ranked-choice final rounds

- **PASS** In all 13 ranked-choice contests, first choices on the map equal round 1, final-round ED rows add to the final round, and every ballot is counted once ([])
- rcv_build.py checks each tabulation against the BOE certified round-by-round reports: 37 of 38 contests match the certified final round exactly; the one left out (Republican Council 47) was certified by hand count and is not shown as ranked choice
- **PASS** Mayoral primary final round equals the BOE certified 573,169 to 443,229 ({'Andrew M. Cuomo': 443229, 'Zohran Kwame Mamdani': 573169})

## D. Eligible voters (CVAP) vs the Census Bureau tables

- **PASS** Borough CVAP equals the sum of the Bureau block groups it is built from (nothing lost in the split to EDs) ({'Bronx': 1, 'Brooklyn': 0, 'Manhattan': -5, 'Queens': 4, 'Staten Island': 0})
- **PASS** Borough CVAP vs the Bureau county table (a separate estimate, so within 0.1%) ({'Bronx': '+0.039%', 'Brooklyn': '+0.028%', 'Manhattan': '+0.042%', 'Queens': '+0.062%', 'Staten Island': '+0.044%'})
- **PASS** CD CVAP (districts wholly in NYC) vs the Bureau CD.csv (11 districts, max gap 0.29% (cd 15), median 0.09%, 11 within the Bureau MOE)
- **PASS** SD CVAP (districts wholly in NYC) vs the Bureau SLDUC.csv (26 districts, max gap 0.72% (sd 29), median 0.14%, 26 within the Bureau MOE)
- **PASS** AD CVAP (districts wholly in NYC) vs the Bureau SLDLC.csv (65 districts, max gap 1.49% (ad 36), median 0.39%, 65 within the Bureau MOE)

## E. Representatives

- **PASS** Every officeholder matches the certified winner, or the seat is flagged as changed hands or vacant (157 seats; changed hands: ['cc3', 'sd22', 'sd47']; vacant: ['sd12'])
- **PASS** State legislators match OpenStates (0 differ: [])
- **PASS** A record for every district touching NYC ({'cc': 51, 'ad': 65, 'sd': 28, 'cd': 13})
- **PASS** Every sitting representative has a phone number (missing: [])
- **PASS** Citywide officials come from the certified 2025 general ([('Mayor|Citywide', 'Zohran Kwame Mamdani'), ('Public Advocate|Citywide', 'Jumaane D. Williams'), ('City Comptroller|Citywide', 'Mark D. Levine')])

## F. Poll sites

- **PASS** Every election district on the map has an Election Day site (4214 EDs, 0 without: [])
- **PASS** Every election district has an early voting site (0 without)
- **PASS** Each geocoded poll site lies in the borough its address names (1282 sites; 0 off: [])
- **PASS** Election Day sites are near the districts they serve (over 1.5 miles flagged) (4025 EDs with voters; 0 over 1.5 miles: [])

## G. Homes (PLUTO)

- **PASS** Site homes by ED equal the downloadable CSV (0 differ)
- **PASS** Building-size groups add up to all homes in every ED (0 EDs off)
- **PASS** Homes by ED track 2020 Census housing units (median PLUTO/Census 0.982, middle half 0.924 to 1.041, 180 of 3839 EDs off by half or more)
- **PASS** ED and tract homes add to the same city total

## H. Neighborhood conditions vs the API's own district fields

- **PASS** 311 service requests: share of records placed in an election district (97.94% of 3,963,900, 2025-10-01 to 2026-09-30)
- **PASS** HPD housing code violations: share of records placed in an election district (99.99% of 894,631, 2025-10-01 to 2026-09-30)
- **PASS** Residential evictions: share of records placed in an election district (98.46% of 16,727, 2025-10-01 to 2026-09-30)
- **PASS** NYPD crime complaints: share of records placed in an election district (100.0% of 552,190, 2025-07-01 to 2026-06-30)
- **PASS** 311 service requests by Council district vs the agency's own council field (correlation 0.9998, median gap 0.4%, largest 3.8% (CC 6); the agency field uses its own geocoding, so small gaps are expected)
- **PASS** HPD housing code violations by Council district vs the agency's own council field (correlation 1.0000, median gap 0.0%, largest 0.4% (CC 4); the agency field uses its own geocoding, so small gaps are expected)
- **PASS** Residential evictions by Council district vs the agency's own council field (correlation 0.9890, median gap 7.8%, largest 34.9% (CC 33); the agency field uses its own geocoding, so small gaps are expected)
- **PASS** Tax lot to election district lookup (used to place 311, HPD and eviction records) agrees with PLUTO's own Council district on each lot (99.983% of 857,323 lots, 99.9989% of homes. The marshals' eviction file carries its own council field that disagrees with PLUTO on more lots, which is why the eviction comparison above is looser)
- **PASS** NYPD complaints by borough vs the NYPD's own borough field ({'Bronx': np.float64(-1.74), 'Brooklyn': np.float64(-1.18), 'Manhattan': np.float64(0.81), 'Queens': np.float64(-1.15), 'Staten Island': np.float64(-1.31)})

## I. Council discretionary funding

- **PASS** Published FY2027 total equals the workbook ($705,704,000)
- **PASS** District, Speaker, delegation and citywide pieces add to the total ($705,704,000)
- **PASS** Each district total equals the workbook rows under its member's name (re-read with openpyxl) ([])

## J. Donations by ZIP

- CFB 2025 city races from NYC ZIP areas: $29,806,551; FEC 2025–26: $344,414,367
- **PASS** ZIP areas add to the stated NYC totals for both sources
- **PASS** CFB totals by ZIP area re-summed from the raw file with a separate reader equal the published ones (177 areas; 0 differ, e.g. [])
