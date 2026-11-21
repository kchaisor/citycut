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
7. **The Analysis bar is always there** at the bottom of the 3D and Drawing views (not Satellite), with an "Analysis" header. There is no Analysis icon in the left tool rail any more; Display, Import and Export stay.
8. **The three analyses are toggles.** Clicking Solar Study, Wind Rose or Viewshed Walk turns it on; clicking the one that is on turns it off, leaving nothing selected; clicking another switches to it. Wind streaks only run while Wind Rose is on.
9. **The 3D Sun Dome belongs to Solar Study.** The dome, and its chip, only take effect while Solar Study is on. Switching to Wind Rose or Viewshed Walk, or turning Solar Study off, hides the dome even if its chip was left on. The chip also shows in Drawing, beside Shadows, Sun hours and the 9–3pm Plan Fan.
10. **Date buttons name the solstices:** "21 Jun · Winter solstice", "22 Sep · Equinox" and "22 Dec · Summer solstice".
11. **Walk Ripple is removed** from the product.

## How we'll know it works

Open 40 Cleeland St, Dandenong (`?lat=-37.983826&lon=145.21555&label=40+Cleeland+St%2C+Dandenong+VIC+3175&km=1`), turn Solar Study on in the Analysis bar, pick 21 Jun · Winter solstice around 15:00, Perspective, Shadows on.

- [ ] In the greyscale Perspective view with Shadows on, shadows on the ground and on buildings are a strong, readable dark grey, with detail still visible in the shade and sunlit roofs and walls staying light, without the scene going muddy or black.
- [ ] Trees, roads, terrain and buildings are grey; switching to Wind Rose, or turning Solar Study off, brings the colours back.
- [ ] When the model first opens, the 3D scene is in colour, not grey, and the Analysis bar shows with an "Analysis" header and Solar Study, Wind Rose and Viewshed Walk all off.
- [ ] A new cut has no wind streaks, no sun dome, no shadows, no Sun hours and no Plan Fan, even after a visit that left wind on.
- [ ] The left tool rail has no Analysis icon.
- [ ] Clicking Solar Study twice turns it on and then off again; the bar stays visible with nothing selected.
- [ ] With 3D Sun Dome on, switching to Wind Rose hides the dome and starts the wind streaks; turning Wind Rose off stops them.
- [ ] In Drawing with Solar Study on, the 3D Sun Dome chip sits with Shadows, Sun hours and 9–3pm Plan Fan.
- [ ] The date buttons read "21 Jun · Winter solstice", "22 Sep · Equinox" and "22 Dec · Summer solstice".
- [ ] There is no Walk Ripple anywhere.
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
