Open NYC data: voters, election results, residents, homes, neighborhood conditions, representatives and political money
=====================================================================================================================

Every table here is also in the SQLite database (same names), whose metadata table describes each one.

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

ELECTION RESULTS (certified, NYC Board of Elections)
  results_contests.csv                One row per contest in the Nov 2024 general, June 2025 primary, Nov 2025 general and June 2026 primary.
                                      ed_lines = the ED line release in force at that election (24c, 25b, 25c, 26b). ED numbers are
                                      reused when lines change, so an ED number means that election's ED.
  results_<election>_by_ed.csv        Votes by ED and ballot line. ballot_line "__ballots__" is ballots cast in the ED for the contest.
                                      A candidate on several lines (Democratic and Working Families, say) has one row per line;
                                      candidate gives the person. Rows with zero votes are left out.
  results_combined_eds.csv            EDs the Board reported together with a neighbor; their votes sit in the host ED.
  results_rcv_final_round_by_ed.csv   June 2025 ranked-choice primaries: each ballot's final-round choice, counted in its ED, from the
                                      Board's cast vote records. exhausted = ballots with no finalist ranked. Adds up to the certified final round.

POLL SITES AND REPRESENTATIVES
  poll_sites_by_ed.csv                November 3, 2026: Election Day site (kind = eday) and early voting site (kind = early) for every ED,
                                      with coordinates and the distance from the ED.
  representatives.csv                 Council, Assembly, Senate and Congress members by district, with office contacts, plus citywide
                                      and borough officials elected in 2025.

ELIGIBLE VOTERS
  eligible_voters_by_<level>.csv      Citizens 18 and over (Census CVAP special tabulation, 2020-2024) split into EDs by 2020 blocks,
                                      with margins and reliability, and active voters per 100 eligible.

HOMES (NYC Planning PLUTO 26v2)
  homes_by_<level>.csv                Residential units by building size (1-2, 3-9, 10-49, 50+), NYCHA units, residential buildings,
                                      and 2020 Census population and housing units. Hotels, nursing homes, shelters and dorms are left out.

NEIGHBORHOOD CONDITIONS (NYC Open Data API, refreshed weekly)
  conditions_by_<level>.csv           Counts over each source's latest 12 complete months: 311 requests by type, HPD housing code
                                      violations by class, residential evictions, NYPD complaints by type. Divide by the 2020 Census
                                      population or housing units in homes_by_<level>.csv for rates.
  conditions_sources.csv              Each source's window, records, and how they were placed: by tax lot (a record's BBL, through the
                                      lot's PLUTO point), by coordinates, or shared equally among EDs when within 25 feet of an ED line.
                                      Shared records make fractional counts.

COUNCIL FUNDING AND DONATIONS
  council_funding_fy2027_by_district.csv     FY2027 discretionary funding each Council Member designated, by program.
  council_funding_fy2027_designations.csv    Every designation: group, amount, agency, purpose. Speaker's and delegation items have no district.
  donations_by_zip.csv                Contributions by donor ZIP area (city health department MODZCTA): 2025 city races from the Campaign
                                      Finance Board (contributions net of refunds) and 2025-2026 federal from the FEC (itemized gifts,
                                      earmarked conduit records not double counted). ZIP codes 11001, 11003 and 11040 only clip Queens
                                      and are counted as outside the city.

CHECKS (see report_v4.md)
  Results summed by Assembly district equal the Board's certified recaps on every line (8,763 comparisons).
  Ranked-choice rounds match the Board's certified round-by-round reports. CVAP borough totals equal the Bureau's block groups.
  Conditions by Council district track each agency's own district field; the lot lookup agrees with PLUTO on 99.98% of lots.
  Funding totals equal the Council workbook; donation totals re-summed from the raw files match.
