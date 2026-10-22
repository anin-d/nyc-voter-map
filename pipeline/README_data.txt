NYC Voter Map data: voter enrollment (Feb 20, 2026) and Census residents (ACS 2020-2024)
===========================================================================================

SOURCES
  Voters      NYS Board of Elections, Voter Enrollment by Election District, Party Affiliation and Status, as of Feb 20, 2026.
  Residents   U.S. Census Bureau, American Community Survey 2020-2024 5-year estimates, census tracts (2020 lines).
  Lines       Election districts: NYC Open Data export of Oct 21, 2026. Council, Assembly, Senate, Congress: NYC Department of City Planning.
  Splitting   2020 Census blocks (population and housing units).

VOTER FILES
  election_districts_enrollment.csv   One row per ED (4,026). Party counts for total / active / inactive, and the district of each type it sits in.
  ed_district_crosswalk.csv           All 4,214 mapped EDs and their districts. has_registered_voters = 0 for the 188 EDs with no voters.
  enrollment_by_<level>.csv           Council (51), Assembly (65), Senate (28, NYC part), Congress (13, NYC part), Borough (5).
  district_nyc_share.csv              Share of each Senate and Congressional district's 2020 residents living in NYC.

  elect_dist   5 digits: Assembly District (2) + ED number (3).
  <party>_<status>   party = dem, rep, con (Conservative), wor (Working Families), oth (all other parties), blank (no party), total.
                     status = total, active, inactive; total = active + inactive.

CENSUS FILES
  census_by_tract.csv                 2,327 tracts.
  census_by_election_district.csv     Each ED.
  census_by_<council|assembly|senate|congressional|borough>.csv
  census_indicator_dictionary.csv     What every column means, its numerator, denominator and universe.
  census_tract_counts.csv             The raw tract counts every indicator is built from.
  census_tract_counts_moe.csv         Their margins of error.
  xw_tract_election_district.csv      Every tract x ED piece: 2020 population, housing units, and the weights used.

  Every indicator has three columns: <name>, <name>_moe, <name>_reliability.
    _moe          90% margin of error, in the same units as the value (percentage points for shares).
    _reliability  high   = coefficient of variation under 15%
                  medium = 15% to 30%, or a unit that gets more than half its residents from split tracts
                  low    = over 30%, an estimate of zero, or more than 130 active voters per 100 eligible
  share_of_residents_from_split_tracts   How much of a unit's population comes from tracts it only partly contains.
  active_voters_per_100_cvap   Active registrants (Feb 2026) per 100 citizens 18+ (ACS). Can exceed 100.

HOW TRACTS ARE SPLIT
  Each 2020 block goes to the ED that contains its center. A unit's share of a tract is the share of the tract's 2020 population
  (person counts) or housing units (household counts) in that unit. Estimates add tract counts times shares. Margins of error add
  tract margins times shares as a root-sum-of-squares, the Census Bureau's approximation. Districts are sums of their EDs.
  Median household income: published value for single tracts; interpolated from 16 income brackets elsewhere (no margin).

WHAT THE MARGINS DO NOT COVER
  Margins describe survey sampling. They do not include the extra error from splitting tracts, which assumes residents are spread
  as they were in 2020. That is why ED-level numbers are capped at medium reliability and why registration rates above 130 are flagged.

CHECKS (see audit_report.md)
  ED rows equal the original BOE workbooks cell for cell, and add to each county's published totals.
  ED-to-district assignments match the Census Bureau's 2024 Senate, Assembly and Congress lines and NYC Open Data council lines.
  Tract sums equal the Bureau's county and city estimates. Split-tract district estimates match the Bureau's own district estimates
  (Senate, Assembly, Congress) within about 1% for population and within 2 points for every share tested.

DISTRICTS THAT CROSS THE CITY LINE (NYC part only)
  State Senate 34 (80.7% of residents in NYC), State Senate 36 (76.8%), Congress 3 (24.0%), Congress 16 (9.2%).
