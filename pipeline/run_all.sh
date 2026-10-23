#!/usr/bin/env bash
# Rebuild every dataset and the site data from source files. Run from the repo root.
# Inputs (not in git, see README): raw/enrollment/*.xlsx (BOE), raw/ED_user.geojson (NYC Open Data EDs),
# raw/acs/nyc_*.dat and raw/acs/ref/*.dat (Census summary file extracts), raw/census/*.zip (TIGER), raw/tracts2020.geojson (DCP),
# raw/cvap/ (Census CVAP special tabulation), raw/results/ (BOE ED-level results, CVRs, RCV reports), raw/ed_vintages/ (DCP ED releases),
# raw/reps/, raw/polls/, raw/pluto/, raw/footprints/, raw/nycha/, raw/discretionary/, raw/cfb/, raw/fec/, raw/zip/.
set -euo pipefail
python3 pipeline/parse.py raw/enrollment          # BOE workbooks -> data/enrollment_long.csv, checked against county totals
python3 pipeline/fetch.py                         # DCP district lines -> raw/*.geojson
python3 pipeline/crosswalk.py                     # ED -> council, assembly, senate, congress
python3 pipeline/build_db.py raw/enrollment       # voter tables -> out/
python3 pipeline/web_assets.py                    # map files -> site/data/
python3 pipeline/census_build.py                  # ACS indicators, margins, crosswalk -> data/census/, site/data/
python3 pipeline/cvap_build.py                    # official eligible voters (CVAP) by block group -> site/data/cvap.json
python3 pipeline/results_validate.py              # ED results vs certified recaps (must show zero differences)
python3 pipeline/rcv_build.py                     # 2025 primary ranked-choice rounds from cast vote records, checked vs certified reports
python3 pipeline/results_build.py                 # four elections by ED on their own lines -> site/data/results/
python3 pipeline/reps_build.py                    # representatives from official rosters, checked vs winners and OpenStates
python3 pipeline/polls_parse.py && python3 pipeline/polls_build.py   # Nov 2026 poll sites by ED, geocoded and distance-checked
python3 pipeline/doors_build.py                   # homes by ED from PLUTO, NYCHA and footprints -> site/data/doors.json
python3 pipeline/conditions_ref.py                # only when ED lines or PLUTO change: lot -> ED lookup in pipeline/ref/
python3 pipeline/conditions_build.py              # 311, HPD, evictions, NYPD by ED, straight from the Open Data API (also runs weekly in GitHub Actions)
python3 pipeline/funding_build.py                 # Council discretionary funding FY2027 -> site/data/funding.json
python3 pipeline/donations_build.py               # CFB and FEC donations by donor ZIP -> site/data/donations.json
python3 pipeline/package.py                       # SQLite + CSV bundle -> out/, site/downloads/
python3 pipeline/audit.py                         # independent checks -> audit/report.md
cp audit/report.md out/audit_report.md && python3 pipeline/package.py
node tests/consistency.test.js && node tests/lookup.test.js
