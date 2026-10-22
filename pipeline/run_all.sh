#!/usr/bin/env bash
# Rebuild every dataset and the site data from source files. Run from the repo root.
# Inputs (not in git, see README): raw/enrollment/*.xlsx (BOE), raw/ED_user.geojson (NYC Open Data EDs),
# raw/acs/nyc_*.dat and raw/acs/ref/*.dat (Census summary file extracts), raw/census/*.zip (TIGER), raw/tracts2020.geojson (DCP).
set -euo pipefail
python3 pipeline/parse.py raw/enrollment          # BOE workbooks -> data/enrollment_long.csv, checked against county totals
python3 pipeline/fetch.py                         # DCP district lines -> raw/*.geojson
python3 pipeline/crosswalk.py                     # ED -> council, assembly, senate, congress
python3 pipeline/build_db.py raw/enrollment       # voter tables -> out/
python3 pipeline/web_assets.py                    # map files -> site/data/
python3 pipeline/census_build.py                  # ACS indicators, margins, crosswalk -> data/census/, site/data/
python3 pipeline/package.py                       # SQLite + CSV bundle -> out/, site/downloads/
python3 pipeline/audit.py                         # independent checks -> audit/report.md
cp audit/report.md out/audit_report.md && python3 pipeline/package.py
node tests/consistency.test.js && node tests/lookup.test.js
