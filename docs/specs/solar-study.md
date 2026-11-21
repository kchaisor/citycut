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

### 3D Sun Dome look (Designbot review, 21 Nov 2026)

12. **Size and place.** The dome sits on the centre of the site cut. Its radius is 0.6 × the cut's half-diagonal, kept between 120 m and 350 m: a 1 km square gets 350 m, a 400 m square about 170 m, a 200 m square 120 m. The radius is worked out from the cut; there is no radius slider for the 3D dome.
13. **Camera.** When the dome turns on, the camera eases (250 ms) so the dome fits in the part of the view that is not covered by the on-screen panels, with 16 px to spare. Reduced motion jumps straight there. Any drag stops the ease.
14. **Lines and labels stay the same size on screen** at every zoom. Lines are fixed-pixel and labels are a constant screen size.
15. **Three line styles only.** The selected date's sun path is solid 2 px `--ink`. The other key dates are 1 px `--ink-3`: 21 Jun dashed 6/4, 22 Dec dotted 2/3, the equinox dashed 2/4. Hour lines are 0.75 px `--ink` at 35%. When the selected date is a key date, it is drawn once, in the selected style.
16. **Hour labels** are only on the selected date's path, and only 09h, 12h and 15h, in Geist Mono 11/600 with tabular figures, 6 px outside the path, with a 2 px background-coloured halo.
17. **Date labels** read "21 Jun" and "22 Dec" (and the selected date, day first), in Geist 11/500 `--ink-2` with a halo, at the sunset end of their path. The equinox has no label on the dome; the key covers it.
18. **Horizon ring** is 1 px `--ink` at 25%, with 4 px ticks every 10°, and labels every 30° plus N / E / S / W in 10/700 caps.
19. **The sun is the only accent:** a 10 px `--accent` dot with a 1 px `--ink` edge and a thin drop line to the ground. No yellow lines and no rayed sun icon.
20. **Inline key.** While Solar Study is on and the 3D Sun Dome chip is on (3D view), a quiet key sits right after the Shadows / Sun hours / 3D Sun Dome chips in the Analysis bar: the selected date, the other key dates, hour lines and the sun dot, in micro type.
21. The dome still belongs to Solar Study (item 9): it is hidden in Wind Rose, in Viewshed Walk and when every analysis is off.

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
- [ ] On a 1 km cut the 3D Sun Dome is 350 m across the radius and centred on the cut; turning it on eases the camera so the dome clears the panels.
- [ ] Zooming in and out keeps the dome lines and labels the same size on screen.
- [ ] With 22 Dec picked, its path is the only solid line; 21 Jun is dashed, the equinox is finely dashed, and the hour lines are faint. Only 09h, 12h and 15h are labelled, and only on 22 Dec. The paths are labelled "21 Jun" and "22 Dec" at their sunset ends.
- [ ] The only yellow on the dome is the sun dot, which has an ink edge and a drop line.
- [ ] The Analysis bar shows the dome key beside the 3D Sun Dome chip while the dome is on, and the bar still fits on two rows at 1440×900.
- [ ] The time slider runs 06 to 20, with the sunrise and sunset times still shown; dragging before sunrise or after sunset shows a night scene with no sun.
- [ ] The Sun hours pill is off when the model opens, and turning it on colours the site and shows the Direct Sun Hours legend.
- [ ] In 3D with Sun hours on, the ground colour and the gaps under buildings line up with the 3D building footprints, at Dandenong and at Pyrmont (`?lat=-33.86627&lon=151.18389&km=1.5`). Before the fix, the ground colour on terrain was flipped north–south.
- [ ] Every roof is fully coloured, with no bare white patches on large roofs. Before the fix, the roof colour sat just under the roof, so large roofs showed through.

## Out of scope

- No new solar standards or changes to the Victorian shadow-standard hours.
- No change to wind analysis.
- No merge without Kelvin's go.

## Estimated runs

- 2–3
