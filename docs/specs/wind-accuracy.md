# Feature: Wind accuracy

## What it does

Makes the wind rose, the plan wind maps and the 3D wind closer to what wind consultants use for the same site. Kelvin approved four fixes on 18 Nov 2026 after the Pyrmont check (Riverview's short 7-year file, the Airport being the consultants' station, and the three regional design winds):

1. **Longest weather record.** Use the longest weather record available for each station, not the file whose name says 2009–2023. Riverview Observatory, for example, goes from 7 years (2009–2015) to 19 years (1997–2015).
2. **Sydney Airport for harbour sites.** Prefer Sydney Airport for harbour sites, and say in the wind panel which station is used, how far away it is, the years covered, and why a closer station was skipped.
3. **Design winds.** Add the three design winds, north-east, south and west, to the maps alongside the seasons.
4. **Faster wind over water.** Wind runs faster over open water than over streets and buildings.

All of this stays indicative, not a CFD study.

## What it looks like

Screens this touches: the wind-rose card and its station line; the plan Wind speed and Comfort maps; the season and direction steps on the wind card; the 3D ground wind.

Sketch or screenshot:

<!-- drop a sketch or screenshot here -->

- Station line in the wind panel, for example: "Sydney Airport · 9.0 km · 2011–2025 (15 years). Riverview, 4.8 km, skipped: inland and sheltered."
- Design winds sit with the seasons as extra choices: NE, S, W. Each one uses that direction's own speed at the station.

## Kelvin's preferences

- Consultant-style design winds (north-east, south, west) on the maps, as in the Windtech and CPP studies for Pyrmont and Blackwattle Bay (Kelvin's yes, 18 Nov 2026).
- The station is named in the panel, with distance, years and the reason a closer one was skipped (Kelvin's yes, 18 Nov 2026).

## How we'll know it works

- [x] Pyrmont (−33.86627, 151.18389), 1.5 km cut: the panel names Sydney Airport, its distance (about 8.9 km), the years covered, and why Riverview and Observatory Hill were skipped.
- [x] Pyrmont: the station's record is its longest usable one (Riverview 1997–2015, 19 years, not 2009–2015; the Airport's 2011–2025 file, because its full record looks gappy).
- [x] Pyrmont: NE, S and W can be picked on the maps next to the seasons, and each shows its own wakes and speeds.
- [ ] Pyrmont: the bay runs visibly faster than the streets on Wind speed.
- [x] Mont Albert North (−37.80458, 145.1065), 1 km cut: still uses Viewbank, and the panel names it.
- [ ] Observatory Hill is used or skipped by the calm checks (no more than 30% calm in winter, 35% over the year), never by name.

Note after fix 1 (18 Nov 2026): Observatory Hill's full record (1954–2025, 64 years) passes the calm checks (5.4% calm in winter, 6.7% over the year). Its 2009–2023 file failed them (99.9% calm in winter). Until fix 2, Pyrmont therefore uses Observatory Hill, 2.0 km away, instead of Riverview. Fix 2 still prefers Sydney Airport for harbour sites, so the panel has to say why Observatory Hill was skipped.

Melbourne Regional Office shows the same pattern. Its full record (1954–2015, 54 years) passes the calm checks (11.5% calm in winter), so Melbourne CBD now uses it, 0.9 km away, instead of Olympic Park (2.8 km). The station closed in 2015. 17 stations now pass the calm checks that failed before; none went the other way. The station list grows from 796 to 875, because full-record files were never listed before.

Note after fix 2 (18 Nov 2026): sites within 12 km of Fort Denison count as harbour sites and use Sydney Airport (9.0 km from Pyrmont, 1940–2025, 82 years) when its record passes the calm checks. That covers Pyrmont, the CBD, North Sydney, Balmain, Rozelle and Mosman, but not Parramatta, Penrith or Hornsby. Everywhere else still uses the nearest station that passes the calm checks. For Pyrmont the panel lists the closer stations it skipped: Observatory Hill (2.0 km), Riverview (4.8 km) and Canterbury Park Racecourse (7.9 km), all for "harbour site: Sydney Airport preferred". A station that fails the calm checks is listed as "wind record mostly calm, N% calm in winter".

Note on gappy long records (18 Nov 2026): Sydney Airport's full record (1940–2025) builds its typical months from the 1950s and 60s, which look like 3-hourly observations with the gaps read as calm: 10.8% calm over the year, 16.8% in summer and 20.2% in winter, against 1–3% in every season in each of its 15-year files and in BoM's 3 pm roses. That lowered the speeds (5.1 instead of 5.8 m/s over the year) and turned summer north-east. A longer record is now used only if its calm share, over the year and in every season, is no more than 5 points above the station's most recent dated file, when that file itself passes the calm checks. Otherwise the next longest is tried, and between equal lengths the later one. Sydney Airport now uses 2011–2025 (15 years): 1.6% calm over the year, summer from the south at 6.2 m/s. Riverview (1997–2015) and Observatory Hill (1954–2025, whose recent file is mostly calm) keep their full records, as do Melbourne Regional Office and Viewbank. 155 of 875 stations change record this way.

Note after fix 3 (18 Nov 2026): design winds sit next to the season buttons on the wind console. Sites that use Sydney Airport get the consultants' north-east, south and west (45°, 180°, 270°). Everywhere else gets the three of the eight compass directions whose winds bring the most energy over the year (hours × speed³ within 22.5° either side), at least 67.5° apart. Each design wind's speed is the average station speed of the year's hours within 22.5° of its heading, brought down to walking height the same way as the seasons. Pyrmont: NE 6.2 m/s at the station, 3.9 m/s at walking height, 18% of hours; S 7.5 and 4.6 m/s, 23%; W 5.5 and 3.4 m/s, 22%. Mont Albert North (Viewbank): N, SE and SW. Comfort still uses all winds over the year when a design wind is picked.

## Out of scope

- No CFD or wind-tunnel modelling.
- No gust or 5% exceedance statistics.
- No live or forecast weather.

## Estimated runs

- 4–6 runs: this spec and the longest record (1), Sydney Airport and the station line (1–2), design winds (1–2), wind over water (1), plus a final check.
