# Feature: Solar Study

## What it does

Solar Study is one of the three analyses in the Analysis bar, beside Wind Rose and Viewshed Walk. It is off when a site is cut, and you turn it on and off from the bar. It shows where the sun is for a chosen date and time, casts live shadows on the 3D site, and draws the 3D sun dome. A Direct Sun Hours study colours the ground, roofs and walls by how many hours of direct sun each spot gets on the chosen day, with a Ladybug-style blue-to-yellow scale and a legend.

## What it looks like

Screens this touches: the 3D model (Perspective and Isometric), the Analysis bar at the bottom of the viewport, and the Drawing site plan (Direct Sun Hours colouring and legend only).

Sketch or screenshot:

Kelvin's reference shots from 19 Nov 2026: 40 Cleeland St, Dandenong, Perspective, Solar Study on, 3D Sun Dome on, Shadows on, 21 Jun 15:56. Shadows are almost invisible, trees are still green, and the time slider stops at sunrise and sunset.

### Kelvin's preferences (19 Nov 2026)

1. In Perspective and Isometric 3D, Solar Study shadows are clearly dark and legible on the ground and on buildings. Today they are too faint in the Primary studio view.
2. The Solar Study time slider runs from 6am to 8pm. The sunrise and sunset markers stay. Hours outside daylight are night, with no sun.
3. While Solar Study is on, the whole 3D scene is greyscale: trees, roads, terrain and buildings, with no green trees. Colour comes back when Solar Study is turned off or another analysis is picked. (Updated 21 Nov 2026: the Analysis bar being visible is not enough; only the Solar Study toggle greys the scene.) The exceptions that stay in colour are the Direct Sun Hours colouring (when it is on), the sun dome, the sun, and the on-screen controls.
4. A "Sun hours" pill sits in the Analysis bar next to "Shadows" and "3D Sun Dome", in the same pill style, and starts off. It shows or hides the Direct Sun Hours colouring on the site, together with its legend.
5. Follow-up, 19 Nov 2026: after first accepting the earlier shadow darkness, Kelvin asked to try a version with clearly darker cast shadows: a strong, readable dark grey, not washed-out pale shadows and not a crushed-black or night-like scene.

### Kelvin's preferences (21 Nov 2026)

These replace the earlier idea that Solar Study is the default and is implied by "Site Analysis is open".

6. **Nothing is on at a new cut.** Solar Study, Wind Rose, Viewshed Walk, the 3D Sun Dome, Shadows, Sun hours and the 9–3pm Plan Fan all start off. Wind does not come back on just because it was on in an earlier visit.
7. **The Analysis bar is always there** at the bottom of the 3D and Drawing views (not Satellite), with an "Analysis" header. There is no Analysis icon in the left tool rail any more; Display, Import and Export stay. The bar always uses the full two-row Solar Study layout — header, Solar Study / Wind Rose / Viewshed Walk chips, the ALT / AZ / DAYLIGHT readout, Shadows / Sun hours / 3D Sun Dome (and 9–3pm Plan Fan in Drawing), the date presets and the time slider — even when nothing is switched on. When Solar Study is off, those solar controls stay visible but inactive (a muted, non-interactive look). Wind Rose and Viewshed Walk still swap their own rows in when they are on. A compact High / Fast quality switch sits at the right end of the top row and is always available. (Updated 22 Nov 2026.)
8. **The three analyses are toggles.** Clicking Solar Study, Wind Rose or Viewshed Walk turns it on; clicking the one that is on turns it off, leaving nothing selected; clicking another switches to it. Turning Solar Study off does not collapse the bar. Wind streaks only run while Wind Rose is on.
9. **The 3D Sun Dome belongs to Solar Study.** The dome, and its chip, only take effect while Solar Study is on. Switching to Wind Rose or Viewshed Walk, or turning Solar Study off, hides the dome even if its chip was left on. The chip also shows in Drawing, beside Shadows, Sun hours and the 9–3pm Plan Fan.
10. **Date buttons name the solstices:** "21 Jun · Winter solstice", "22 Sep · Equinox" and "22 Dec · Summer solstice".
11. **Walk Ripple is removed** from the product.

### Kelvin's preferences (22 Nov 2026, Direct Sun Hours resolution)

Approved by Kelvin on 22 Nov 2026 (t81u): "Ok let's try this."

12. **The High / Fast switch also sets Direct Sun Hours resolution.** There is no second control; the same switch in the Analysis bar covers both.
13. **Fast** is the current study: a 3 m grid and 15-minute time steps on ground, roofs and walls.
14. **High** is a 1 m grid and 5-minute time steps on ground, roofs and walls, limited to the cut and the buildings already in the sun-hours model.
15. **Big cuts ease the High grid.** If a cut is too big for a 1 m grid (more than about 250,000 ground cells, the size of a 0.5 km cut at 1 m), the grid eases to 1.5 m and then 2 m. The 5-minute step stays. A 0.5 km cut stays at 1 m; a 1 km cut runs at 2 m. Walls coarsen first if they would blow the wall budget, as they already do in Fast.
16. **The legend says what was used.** The legend footnote states the actual grid and time step of the result on screen, and says when the grid was eased from 1 m for the cut size.
17. **The wait is visible.** While the study is calculating, the legend shows a "Calculating …" line naming the grid and step being worked on. The previous result stays on screen until the new one is ready; before the first result, the legend shows only its title and the calculating line. The study runs off the main thread, and a new date, model or quality cancels the old run.
18. **High / Fast still also sets 3D render quality** (ambient occlusion and SMAA), unchanged.
19. Results cannot be more accurate than the building heights and the terrain grid they sit on.
20. **High roofs and walls coarsen under a cap so building surfaces finish in a reasonable time.** In High, if roofs would need more than about 24,000 samples, the roof cell doubles from the High grid (up to 12 m) until they fit; walls do the same above about 52,000 samples. Every building keeps at least one roof sample. On dense or large cuts this makes High roof and wall cells coarser than the ground grid, and they can be coarser than Fast's. Fast is unchanged, and so are the High ground grid and the 5-minute step. (Added 22 Nov 2026, afternoon.)
21. **High ground now targets a 0.25 m grid.** Kelvin's yes, 22 Nov 2026 ("Yes, do both"). This replaces the High ground grid sizes in 14–16. High starts the ground at 0.25 m and eases up a ladder (0.25, 0.5, 1, 1.5, then 2 m) until the ground is at or under about 250,000 cells; the budget itself is unchanged. That keeps 0.25 m for cuts up to about 125 m a side and 0.5 m up to about 250 m; a 0.5 km cut still runs at 1 m and a 1 km cut at 2 m, because 0.25 m there would be 4 million and 16 million cells. The legend footnote shows the actual spacing used and says "Eased from 0.25 m grid" whenever the cut did not get 0.25 m. Roofs and walls still start no finer than 1 m, under the same caps as 20. Fast and the 5-minute step are unchanged.

## How we'll know it works

Open 40 Cleeland St, Dandenong (`?lat=-37.983826&lon=145.21555&label=40+Cleeland+St%2C+Dandenong+VIC+3175&km=1`), turn Solar Study on in the Analysis bar, pick 21 Jun · Winter solstice around 15:00, Perspective, Shadows on.

- [ ] In the greyscale Perspective view with Shadows on, shadows on the ground and on buildings are a strong, readable dark grey, with detail still visible in the shade and sunlit roofs and walls staying light, without the scene going muddy or black.
- [ ] Trees, roads, terrain and buildings are grey; switching to Wind Rose, or turning Solar Study off, brings the colours back.
- [ ] When the model first opens, the 3D scene is in colour, not grey, and the Analysis bar shows the full two-row Solar Study layout with an "Analysis" header, Solar Study / Wind Rose / Viewshed Walk all off, the solar readout, overlays, date presets and time slider visible but inactive, and the High / Fast quality switch at the right.
- [ ] A new cut has no wind streaks, no sun dome, no shadows, no Sun hours and no Plan Fan, even after a visit that left wind on.
- [ ] The left tool rail has no Analysis icon.
- [ ] Clicking Solar Study twice turns it on and then off again; the bar stays visible in the full two-row layout, with the solar controls muted again and nothing selected.
- [ ] With 3D Sun Dome on, switching to Wind Rose hides the dome and starts the wind streaks; turning Wind Rose off stops them.
- [ ] In Drawing with Solar Study on, the 3D Sun Dome chip sits with Shadows, Sun hours and 9–3pm Plan Fan.
- [ ] The date buttons read "21 Jun · Winter solstice", "22 Sep · Equinox" and "22 Dec · Summer solstice".
- [ ] There is no Walk Ripple anywhere.
- [ ] The time slider runs 06 to 20, with the sunrise and sunset times still shown; dragging before sunrise or after sunset shows a night scene with no sun.
- [ ] The Sun hours pill is off when the model opens, and turning it on colours the site and shows the Direct Sun Hours legend.
- [ ] In 3D with Sun hours on, the ground colour and the gaps under buildings line up with the 3D building footprints, at Dandenong and at Pyrmont (`?lat=-33.86627&lon=151.18389&km=1.5`). Before the fix, the ground colour on terrain was flipped north–south.
- [ ] Every roof is fully coloured, with no bare white patches on large roofs. Before the fix, the roof colour sat just under the roof, so large roofs showed through.
- [ ] With Sun hours on, the legend footnote reads "3 m grid · 15 min steps" on Fast and "1 m grid · 5 min steps" on High for a 0.5 km cut; on a 1 km cut, High reads "2 m grid · 5 min steps". Both say the grid was eased from 0.25 m for this cut size (updated 22 Nov 2026, see 21). Switching High / Fast shows a "Calculating …" line on the legend until the new result is ready, the page stays responsive, and 3D ambient occlusion and SMAA still follow the switch.

## Out of scope

- No new solar standards or changes to the Victorian shadow-standard hours.
- No change to wind analysis.
- No merge without Kelvin's go.

## Estimated runs

- 2–3
