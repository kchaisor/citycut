# Feature: Plan wind diagrams (Wind speed + Pedestrian comfort)

## What it does

In Plan view with Wind Rose on, the ground becomes a top-down wind diagram. A **Wind speed | Comfort** switch in the bottom wind console flips between a velocity map in m/s for one season and direction, and a Lawson-style pedestrian comfort map that combines every direction in the season. Both reuse the wind data and flow model from the 3D wind draft (#232). They are indicative only, not a CFD study.

## What it looks like

Screens this touches: Plan view of the 3D model with Analysis → Wind Rose on; the wind-rose card (left); the floating Velocity and Comfort legend cards (lower right); the bottom wind console; Site Intelligence (right, collapse only).

Sketch or screenshot (Paper mock-ups v2, approved by Designbot on 17 Nov 2026):

![Wind speed, 1440](wind-plan-comfort/v2-speed-1440.png)
![Comfort, 1440](wind-plan-comfort/v2-comfort-1440.png)

The 1024 mock-ups are on the shared computer at `/workspace/wind-plan-mock/v2-speed-1024.png` and `v2-comfort-1024.png`. Wind speed keeps the mock-up with the wind arrow at the upwind map edge. Comfort no longer follows the mock-up: since 19 Nov 2026 it follows Kelvin's Lawson reference (White Bay / Rozelle comfort map, `/workspace/comfort-restyle/kelvin-reference.png`), described under Comfort below.

### Wind speed
- The ground shows a smooth velocity field in m/s: the #232 speed-ratio field for the heading, times the season's reference speed for that direction. The scale is fixed at 0–4 m/s, not per site; speeds above 4 m/s take the top colour.
- Styled like Kelvin's CFD reference: a smooth continuous colour field (the speed field is bilinear-sampled onto an image about 4× the grid before colouring, so there are no colour steps), fine grey isolines across the whole field, and deep-blue sheltered wakes. The plan has its own ramp (`--wind-plan-speed-*`, linear between stops): 0 m/s deep royal blue, 1 m/s mid blue, 2 m/s cyan, 2.8 m/s green-yellow, 3.5 m/s yellow, 4 m/s orange-red. Typical lee-side wakes (about 0.8–1.5 m/s) stay deep to mid blue; only tight speed-ups go yellow or orange. The 3D streaks keep the #232 ramp.
- Pedestrian height: the Viewbank TMYx speeds are measured at 10 m in open terrain, so they are brought down to 1.5 m with a power-law profile, suburban exponent α = 0.25 (factor (1.5/10)^0.25 ≈ 0.62), before multiplying by the speed-ratio field. The card's Reference row shows this corrected speed; the console median stays the station value.
- The map is smoothed for display only (Gaussian, about 6 m) so it reads as flow shaped by buildings, not speckle. Contours use the same smoothed field; comfort classes use the unsmoothed one.
- Cells near the cut edge are computed with the cut's buildings wrapped round its edges (a periodic boundary), so the edge sees built-up ground upwind and downwind like the rest of the site rather than open land. Nothing outside the cut is drawn.
- Wakes (low speed) sit on the lee side of each building and move when the season or direction changes. Corners and gaps speed up.
- Imported models: wind treats every visible imported model as solid and removes map buildings underneath them (any footprint overlap drops the whole map building), plus trees whose crowns overlap them, so they are not counted twice. Moving, hiding or removing an import recomputes the field. The 3D ground-wind flow uses the same obstacle grid. Imported models are drawn on the wind maps in the same style as map buildings: white on Wind speed, light grey on Comfort. Map buildings under an import still draw on the wind maps, in the 3D view, plans and exports unless the user hides them. Hidden map buildings (Hide selected or a hidden use) are left out of the wind: the obstacle grid for the plan and the 3D flow.
- Preference: wind treats imported models as solid and removes map buildings underneath them (Kelvin's yes, 17 Nov 2026).
- Preference: imported models are drawn on the wind maps; hidden map buildings are left out of the wind (Kelvin's yes, 17 Nov 2026).
- Isolines every 0.25 m/s from 0.25 to 3.75 m/s, uniform 0.75px mid grey (#5A5A5A) at 30% opacity, so they read as a fine mesh, not bold belts.
- A tall vertical **Velocity (m/s)** legend card sits in the lower-right corner of the map: the plan ramp as a vertical bar, 0 at the bottom and 4 at the top, with 11px Geist Mono ticks 0 1 2 3 4. It stays at least 8px clear of Site Intelligence, the bottom console and the compass at 1024–1440, shortening the bar or moving left of Site Intelligence if that panel runs long.
- A small info card at the top left of the map, right of the wind-rose card and below the top bar, lists Wind speed (the pedestrian-height reference), Direction and Season. Both cards show on Wind speed only.
- Kelvin's call, 17 Nov 2026: keep the pedestrian-height correction, and use a tighter fixed speed scale (0–4 m/s) so differences show; fixed, not per-site, so maps compare between sites.
- Preference: speed map styled like CFD reference: smooth field, fine isolines, vertical legend (Kelvin's yes, 17 Nov 2026).
- Direction defaults to the season's prevailing direction and can be stepped through the 16 directions on the card. The wind arrow sits at the upwind edge of the map (the cut square on screen: centred on the top edge for N, at the top-right corner for NE), just outside it and pointing in, and follows the camera. It slides along that edge, or steps just inside it, only as far as needed to stay at least 24px clear of any panel (and of buildings when inside the map): 2px ink shaft, filled head, white label chip ("Wind NNE"), 11px/600.

### Comfort (Lawson LDDC, indicative)
- For each ground cell, every direction in the season is weighted by its frequency (from the Viewbank TMYx speed bins) and combined with that direction's speed-ratio field to get how often each threshold is exceeded.
- The station speeds get the same 10 m to 1.5 m pedestrian-height correction as Wind speed (power law, α = 0.25, factor ≈ 0.62) before the thresholds are tested.
- Above the top station bin (40 km/h and over, open-ended) each direction's speeds follow a Weibull curve fitted to that direction's own bins, as wind climates are usually described for comfort studies (NEN 8100). Before 19 Nov 2026 the tail was a fixed exponential guess one bin wide, which made the 15 m/s test fail on open ground at windy stations: at Sydney Airport (White Bay, Pyrmont) open ground came out at 0.04% of the year against the 0.022% limit, so nearly the whole map was flagged Unsafe. The fitted curves come out close to the textbook shape for wind (k ≈ 2) and put that open ground near 0%; strong corner and gap speed-ups at exposed sites can still be Unsafe. The thresholds did not change. Directions with too few bins to fit keep the old exponential tail.
- Criteria: Lawson LDDC, with comfort and safety as in the City of London *Wind Microclimate Guidelines* (2019). Comfort uses mean-hourly speeds exceeded no more than 5% of the time, in five bands: Sitting ≤ 4 m/s, Standing ≤ 6 m/s, Strolling ≤ 8 m/s (the LDDC leisure-walking band), Walking ≤ 10 m/s, Uncomfortable above that.
- Unsafe is a safety flag, not a sixth comfort colour: more than 15 m/s for more than 0.022% of the year (about 2 hours). An unsafe patch keeps its comfort-band colour and gains a 45° hatch (1px #7A1A12 at 6px spacing) and a 2px #7A1A12 outline; patches smaller than 12px are drawn as a 12px hatched, outlined disc. All of it stays inside the site clip.
- Styled like Kelvin's Lawson reference (Kelvin's call, 19 Nov 2026):
  - Five Lawson colours, sampled from the reference legend: Sitting #BDF8DA, Standing #6ADCA0, Strolling #F8D404, Walking #FAA902, Uncomfortable #F44333.
  - A smooth, fully opaque filled field: Sitting as the base, then each higher band as a smooth vector contour with clean edges. No grid cells and no isolines.
  - The field is clipped to the site parcel and the parcel is drawn as a dashed red site boundary (#D7263D, the same dash and weight as other CityCut site outlines). Where there is no parcel (for example NSW cuts with no Vicmap parcel), the clip and the dashed outline fall back to the cut rectangle.
  - Inside the cut but outside the site: a muted grey base map (#F3F3F3) with soft grey roads, grey-blue water and grey-green parks. No map tiles, street labels or wind roses.
  - Buildings are light grey (#C5C5C5) with the same light ink edge, inside and outside the site.
  - A boxed Comfort legend card (see Panels).
- The four time-of-day wind roses in the reference are left out for now.
- The card shows "Unsafe: N areas" or "Unsafe: none". Direction reads "All".
- Preference: comfort map styled like the reference: five Lawson colours (Sitting, Standing, Strolling, Walking, Uncomfortable), smooth opaque fill, clipped to a dashed red site boundary (cut fallback when no parcel), muted grey base map with light-grey buildings, boxed HUD legend (Kelvin's yes, 19 Nov 2026).

### Panels and console
- The plan rows (Season, Direction, Reference in m/s or Criteria "Lawson", "Indicative only, not a CFD study") sit at the top of the existing wind-rose card, with "Unsafe: N areas" in Comfort. The card has no legend swatches and no speed bar.
- In Comfort the legend is its own floating card in the lower-right corner, in the same spot and with the same clearance rules as the Velocity card: the usual HUD card surface, border, shadow and 12px corners, a "COMFORT" title (10px/700 uppercase, ink-3), then one column of five rows (Sitting, Standing, Strolling, Walking, Uncomfortable), each a 20×12px swatch with a faint 1px edge, an 8px gap and a 12px/500 ink label. No Unsafe row. It stays at least 8px clear of Site Intelligence, the bottom console and the compass at 1024–1440, moving left of Site Intelligence if that panel runs long.
- The switch uses the white raised sub-option style. Wind Rose stays the one yellow active.
- Plan wind views use m/s only (no km/h in the console) and the console has no DIR readout.
- Buildings have a 1px #1A1A1A edge at 40% opacity: white footprints on Wind speed, light grey on Comfort. Tree dots are hidden in wind plan views.
- At 1280 wide or less, Site Intelligence collapses to its header while a wind plan is showing.
- Colours come from tokens only (DESIGN-SYSTEM.md); any deviation is listed in the PR body.

## How we'll know it works

- [ ] Plan view + Wind Rose shows the Wind speed | Comfort switch in the console, white raised style, with Wind Rose the only yellow active.
- [ ] Wind speed: smooth CFD-style field (deep blue, cyan, yellow, orange) on a fixed 0–4 m/s scale with no colour steps; deep-blue wakes on the lee side of buildings that flip when the season or direction changes; fine grey isolines every 0.25 m/s.
- [ ] Wind speed: vertical Velocity (m/s) legend in the lower-right corner and a top-left Wind speed / Direction / Season card, both hidden in Comfort, at least 8px clear of every panel.
- [ ] Wind arrow at the upwind edge, rotating with direction, at least 24px clear of panels and buildings, with a white "Wind NNE" chip.
- [ ] Comfort: five Lawson bands (Sitting, Standing, Strolling at 8 m/s, Walking, Uncomfortable) in the reference colours, as a smooth opaque fill with clean edges at 1440 and no isolines; Unsafe hatched and outlined over its band colour, at least 12px; the card reads "Unsafe: N areas" or "Unsafe: none"; Direction reads "All".
- [ ] Comfort: the fill stops at the site parcel, drawn as a dashed red site boundary; with no parcel it fills the cut and the dashed outline runs round the cut.
- [ ] Comfort: outside the site the cut shows a muted grey base map with light-grey buildings, grey roads, and soft water and park tones; no tiles or labels.
- [ ] Comfort: a boxed Comfort legend card in the lower right with five single-column rows and no Unsafe row; no swatches in the wind-rose card; at least 8px clear of every panel.
- [ ] A windy station (Sydney Airport, for example White Bay) no longer flags open ground as Unsafe; Unsafe stays limited to strong speed-ups.
- [ ] Plan rows sit inside the wind-rose card; the card has no horizontal speed bar.
- [ ] Console shows m/s only in plan wind views, with no DIR readout.
- [ ] Buildings with a light ink edge, white on Wind speed and light grey on Comfort; no tree dots in wind plan views.
- [ ] At ≤1280 Site Intelligence collapses to its header; zero overlap and gaps of at least 8px at 1024, 1280 and 1440.
- [ ] Import a block: wind recomputes, the lee calms and the corners speed up; hiding or removing the import restores the previous field.
- [ ] Import a block: its footprint appears on both plan wind maps (white on Wind speed, light grey on Comfort) and updates when the import is moved, hidden or removed.
- [ ] Hiding a map building with Hide selected (or hiding its use) drops it from the wind field.
- [ ] Switching season, direction or mode feels instant (fields computed once and cached) and never moves the camera.
- [ ] Tests: lee-side wake (lower behind than upwind, flips with direction), Lawson thresholds including Strolling at 8 m/s, Weibull tail fit, comfort colours and legend order, site clip with cut fallback, unsafe-area count, frequency weights sum to 1.

## Out of scope

- A real CFD or wind-tunnel study and gust (GEM) speeds.
- Exporting the plan diagrams to PNG, .3dm or .ai.
- The four time-of-day wind roses from Kelvin's comfort reference (later).
- Changes to the 3D wind streak renderer from #232. The 3D flow does now use the import-aware obstacle grid.
- Auto-hiding map buildings under imports in the 3D view, plans or exports.
- Mobile layouts.

## Estimated runs

- 3 Claude Code runs (build, fix, polish), about 1 to 1.5 hours, then one screenshot to Kelvin.
