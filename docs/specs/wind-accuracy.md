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

- Station line in the wind panel, for example: "Sydney Airport · 8.9 km · 1940–2025 (82 years). Riverview, 4.8 km, skipped: inland and sheltered."
- Design winds sit with the seasons as extra choices: NE, S, W. Each one uses that direction's own speed at the station.

## Kelvin's preferences

- Consultant-style design winds (north-east, south, west) on the maps, as in the Windtech and CPP studies for Pyrmont and Blackwattle Bay (Kelvin's yes, 18 Nov 2026).
- The station is named in the panel, with distance, years and the reason a closer one was skipped (Kelvin's yes, 18 Nov 2026).

## How we'll know it works

- [ ] Pyrmont (−33.86627, 151.18389), 1.5 km cut: the panel names Sydney Airport, its distance (about 8.9 km), the years covered, and why Riverview and Observatory Hill were skipped.
- [ ] Pyrmont: the station's record is its longest usable one (Riverview 1997–2015, 19 years, not 2009–2015; the Airport's plain file, not a 15-year window).
- [ ] Pyrmont: NE, S and W can be picked on the maps next to the seasons, and each shows its own wakes and speeds.
- [ ] Pyrmont: the bay runs visibly faster than the streets on Wind speed.
- [ ] Mont Albert North (−37.80458, 145.1065), 1 km cut: still uses Viewbank, and the panel names it.
- [ ] Observatory Hill stays skipped while its record fails the calm checks (no more than 30% calm in winter, 35% over the year).

## Out of scope

- No CFD or wind-tunnel modelling.
- No gust or 5% exceedance statistics.
- No live or forecast weather.

## Estimated runs

- 4–6 runs: this spec and the longest record (1), Sydney Airport and the station line (1–2), design winds (1–2), wind over water (1), plus a final check.
