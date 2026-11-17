# Feature: Plan wind diagrams (Wind speed + Pedestrian comfort)

## What it does

In Plan view with Wind Rose on, the ground becomes a top-down wind diagram. A **Wind speed | Comfort** switch in the bottom wind console flips between a velocity map in m/s for one season and direction, and a Lawson-style pedestrian comfort map that combines every direction in the season. Both reuse the wind data and flow model from the 3D wind draft (#232). They are indicative only, not a CFD study.

## What it looks like

Screens this touches: Plan view of the 3D model with Analysis → Wind Rose on; the wind-rose card (left); the bottom wind console; Site Intelligence (right, collapse only).

Sketch or screenshot (Paper mock-ups v2, approved by Designbot on 17 Nov 2026):

![Wind speed, 1440](wind-plan-comfort/v2-speed-1440.png)
![Comfort, 1440](wind-plan-comfort/v2-comfort-1440.png)

The 1024 mock-ups are on the shared computer at `/workspace/wind-plan-mock/v2-speed-1024.png` and `v2-comfort-1024.png`. Three tweaks sit on top of the mock-ups: smooth comfort-band edges, Standing deepened to #9FCB94 with edged legend swatches, and the wind arrow at the upwind map edge.

### Wind speed
- The ground shows a smooth velocity field in m/s: the #232 speed-ratio field for the heading, times the season's reference speed for that direction. The scale is fitted to each site (see the 18 Nov call below): its top is a round number at or above the fastest walking-height speed the map paints in any of the site's views (Annual, Summer, Autumn, Winter, Spring and its three design winds), with the over-water boost included. Peaks up to 4 m/s give 4; from 4 to 6 m/s the top rounds up to the next whole m/s (5 or 6); above 6 m/s it rounds up to the next even number (8, 10, 12…). Switching season or design wind at one site keeps the same scale so the maps compare; stepping through the 16 directions never changes it, and a stepped heading that runs past the top takes the top colour. The scale is worked out once per site before the first Wind speed map is coloured, so it never flashes 0–4 first; Comfort does not wait for it.
- Styled like Kelvin's CFD reference: a smooth continuous colour field (the speed field is bilinear-sampled onto an image about 4× the grid before colouring, so there are no colour steps), fine grey isolines across the whole field, and deep-blue sheltered wakes. The plan has its own ramp (`--wind-plan-speed-*`, linear between stops), set out on 0–4 m/s: 0 m/s deep royal blue, 1 m/s mid blue, 2 m/s cyan, 2.8 m/s green-yellow, 3.5 m/s yellow, 4 m/s orange-red. On a taller site scale the stops stretch in proportion (each stop × top / 4; at a top of 8: 0, 2, 4, 5.6, 7, 8 m/s), so mid-scale stays cyan and only the top of that site's range goes yellow or orange-red. On a 0–4 m/s site typical lee-side wakes (about 0.8–1.5 m/s) stay deep to mid blue. The 3D streaks keep the #232 ramp.
- Pedestrian height: the Viewbank TMYx speeds are measured at 10 m in open terrain, so they are brought down to 1.5 m with a power-law profile, suburban exponent α = 0.25 (factor (1.5/10)^0.25 ≈ 0.62), before multiplying by the speed-ratio field. The card's Reference row shows this corrected speed; the console median stays the station value.
- The map is smoothed for display only (Gaussian, about 6 m) so it reads as flow shaped by buildings, not speckle. Contours use the same smoothed field; comfort classes use the unsmoothed one.
- Cells near the cut edge are computed with the cut's buildings wrapped round its edges (a periodic boundary), so the edge sees built-up ground upwind and downwind like the rest of the site rather than open land. Nothing outside the cut is drawn.
- Wakes (low speed) sit on the lee side of each building and move when the season or direction changes. Corners and gaps speed up.
- Imported models: wind treats every visible imported model as solid and removes map buildings underneath them (any footprint overlap drops the whole map building), plus trees whose crowns overlap them, so they are not counted twice. Moving, hiding or removing an import recomputes the field. The 3D ground-wind flow uses the same obstacle grid. Imported models are drawn on the wind maps as white footprints in the same style as map buildings, in both Wind speed and Comfort. Map buildings under an import still draw on the wind maps, in the 3D view, plans and exports unless the user hides them. Hidden map buildings (Hide selected or a hidden use) are left out of the wind: the obstacle grid for the plan and the 3D flow.
- Preference: wind treats imported models as solid and removes map buildings underneath them (Kelvin's yes, 17 Nov 2026).
- Preference: imported models are drawn on the wind maps; hidden map buildings are left out of the wind (Kelvin's yes, 17 Nov 2026).
- Isolines from one step up to one step below the top: every 0.25 m/s at a top of 4, every 0.5 m/s at a top of 5–8, every 1 m/s at 10 or more. Uniform 0.75px mid grey (#5A5A5A) at 30% opacity, so they read as a fine mesh, not bold belts.
- The **Velocity (m/s)** legend sits inside the wind-rose card, in its footer below the rose and station lines (the slot the Lawson key uses in Comfort): the plan ramp as a horizontal bar about 8px tall with 2px corners across the card's content width, 0 at the left and the site's top at the right, with about five 11px Geist Mono ticks under it: 0 1 2 3 4 at a top of 4, 0 2 4 6 at 6, 0 2 4 6 8 at 8, 0 2 4 6 8 10 at 10. Ticks stay hidden until the site's scale is known. There is no separate velocity card on the map.
- Kelvin's call, 18 Nov 2026: the velocity legend lives inside the wind rose / Plan wind card; there is no separate right-side velocity card.
- A small info card at the top left of the map, right of the wind-rose card and below the top bar, lists Wind speed (the pedestrian-height reference), Direction and Season. It shows on Wind speed only.
- Kelvin's call, 17 Nov 2026: keep the pedestrian-height correction. His call that day for a fixed 0–4 m/s scale is replaced by the 18 Nov call.
- Kelvin's call, 18 Nov 2026: fit the speed scale to each site's winds, minimum top 4 m/s, the same scale across that site's season and design-wind views, keeping the CFD look (smooth field, fine isolines, Velocity (m/s) legend). Comfort stays on the fixed Lawson thresholds.
- Preference: speed map styled like CFD reference: smooth field, fine isolines, a velocity legend (Kelvin's yes, 17 Nov 2026); the legend moved into the wind-rose card on 18 Nov 2026.
- Direction defaults to the season's prevailing direction and can be stepped through the 16 directions on the card. The wind arrow sits at the upwind edge of the map (the cut square on screen: centred on the top edge for N, at the top-right corner for NE), just outside it and pointing in, and follows the camera. It slides along that edge, or steps just inside it, only as far as needed to stay at least 24px clear of any panel (and of buildings when inside the map): 2px ink shaft, filled head, white label chip ("Wind NNE"), 11px/600.

### Comfort (Lawson LDDC, indicative)
- For each ground cell, every direction in the season is weighted by its frequency (from the Viewbank TMYx speed bins) and combined with that direction's speed-ratio field to get how often each threshold is exceeded.
- The station speeds get the same 10 m to 1.5 m pedestrian-height correction as Wind speed (power law, α = 0.25, factor ≈ 0.62) before the thresholds are tested.
- Criteria: Lawson LDDC as used in the City of London *Wind Microclimate Guidelines* (2019). Comfort uses mean-hourly speeds exceeded no more than 5% of the time: Sitting ≤ 4 m/s, Standing ≤ 6 m/s, Walking ≤ 10 m/s (leisure and business walking merged), Uncomfortable above that. Unsafe: more than 15 m/s for more than 0.022% of the year (about 2 hours).
- Hard-edged bands drawn as smooth vector contours, no staircase pixels at 1440. Palette: Sitting #DCEBD8, Standing #9FCB94, Walking #F1DE97, Uncomfortable #E8964F, Unsafe #C2362B. Unsafe also gets a 45° hatch (1px #7A1A12 at 6px spacing), a 2px #7A1A12 outline and a minimum drawn size of 12px, drawn fully inside the map.
- The card shows "Unsafe: N areas" or "Unsafe: none". Direction reads "All".

### Panels and console
- The plan rows (Season, Direction, Reference in m/s or Criteria "Lawson", "Indicative only, not a CFD study") sit at the top of the existing wind-rose card. In Comfort the legend sits at its bottom: five 8px swatches with a 1px rgba(26,26,26,0.2) edge in a 2-column grid. In Wind speed the same footer holds the horizontal Velocity (m/s) bar and ticks instead, never both. The card keeps its 12px padding, stays at least 8px clear of the bottom console, the left rail, the compass and the wind arrow, and scrolls rather than covering the console when space runs short.
- The "Closer:" station line is 12px/500 and wraps only between stations; each distance ("7.9 km") is one unbreakable unit, never clipped or split, and the line is not clamped. Its tooltip keeps the full single-line text.
- The switch uses the white raised sub-option style. Wind Rose stays the one yellow active.
- Plan wind views use m/s only (no km/h in the console) and the console has no DIR readout.
- Buildings are white footprints with a 1px #1A1A1A edge at 40% opacity. Tree dots are hidden in wind plan views.
- At 1280 wide or less, Site Intelligence collapses to its header while a wind plan is showing.
- Colours come from tokens only (DESIGN-SYSTEM.md); any deviation is listed in the PR body.

## How we'll know it works

- [ ] Plan view + Wind Rose shows the Wind speed | Comfort switch in the console, white raised style, with Wind Rose the only yellow active.
- [ ] Wind speed: smooth CFD-style field (deep blue, cyan, yellow, orange) on the site's own scale (0–4 m/s at Mont Albert North, taller at Pyrmont, the same across its seasons and design winds) with no colour steps; deep-blue wakes on the lee side of buildings that flip when the season or direction changes; fine grey isolines (0.25 m/s on a 0–4 scale).
- [ ] Wind speed: horizontal Velocity (m/s) bar and ticks in the wind-rose card footer, no separate velocity card, and a top-left Wind speed / Direction / Season card, both hidden in Comfort, at least 8px clear of every panel.
- [ ] Wind arrow at the upwind edge, rotating with direction, at least 24px clear of panels and buildings, with a white "Wind NNE" chip.
- [ ] Comfort: five Lawson bands with clean edges at 1440 and the listed palette; Unsafe hatched and outlined, at least 12px; the card reads "Unsafe: N areas" or "Unsafe: none"; Direction reads "All".
- [ ] Plan rows sit inside the wind-rose card; in Comfort the card shows the Lawson swatches and no speed bar.
- [ ] The "Closer:" line reads each distance whole ("7.9 km", never "79 km") and wraps between stations.
- [ ] Console shows m/s only in plan wind views, with no DIR readout.
- [ ] Buildings white with a light ink edge; no tree dots in wind plan views.
- [ ] At ≤1280 Site Intelligence collapses to its header; zero overlap and gaps of at least 8px at 1024, 1280 and 1440.
- [ ] Import a block: wind recomputes, the lee calms and the corners speed up; hiding or removing the import restores the previous field.
- [ ] Import a block: its white footprint appears on both plan wind maps (Wind speed and Comfort) and updates when the import is moved, hidden or removed.
- [ ] Hiding a map building with Hide selected (or hiding its use) drops it from the wind field.
- [ ] Switching season, direction or mode feels instant (fields computed once and cached) and never moves the camera.
- [ ] Tests: lee-side wake (lower behind than upwind, flips with direction), Lawson thresholds, unsafe-area count, frequency weights sum to 1.

## Out of scope

- A real CFD or wind-tunnel study and gust (GEM) speeds.
- Exporting the plan diagrams to PNG, .3dm or .ai.
- Changes to the 3D wind streak renderer from #232. The 3D flow does now use the import-aware obstacle grid.
- Auto-hiding map buildings under imports in the 3D view, plans or exports.
- Mobile layouts.

## Estimated runs

- 3 Claude Code runs (build, fix, polish), about 1 to 1.5 hours, then one screenshot to Kelvin.
