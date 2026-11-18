# Feature: Solar Study

## What it does

Solar Study is the default Site Analysis tab. It shows where the sun is for a chosen date and time, casts live shadows on the 3D site, and draws the 3D sun dome. A Direct Sun Hours study colours the ground, roofs and walls by how many hours of direct sun each spot gets on the chosen day, with a Ladybug-style blue-to-yellow scale and a legend.

## What it looks like

Screens this touches: the 3D model (Perspective and Isometric), the Solar Study console at the bottom of the viewport, and the Drawing site plan (Direct Sun Hours colouring and legend only).

Sketch or screenshot:

Kelvin's reference shots from 19 Nov 2026: 40 Cleeland St, Dandenong, Perspective, Solar Study on, 3D Sun Dome on, Shadows on, 21 Jun 15:56. Shadows are almost invisible, trees are still green, and the time slider stops at sunrise and sunset.

### Kelvin's preferences (19 Nov 2026)

1. In Perspective and Isometric 3D, Solar Study shadows are clearly dark and legible on the ground and on buildings. Today they are too faint in the Primary studio view.
2. The Solar Study time slider runs from 6am to 8pm. The sunrise and sunset markers stay. Hours outside daylight are night, with no sun.
3. While Solar Study is the active analysis tab, the whole 3D scene is greyscale: trees, roads, terrain and buildings, with no green trees. Colour comes back when you leave Solar Study. The exceptions that stay in colour are the Direct Sun Hours colouring (when it is on), the sun dome, the sun, and the on-screen controls.
4. A "Sun hours" pill sits in the Solar Study console next to "3D Sun Dome" and "Shadows", in the same pill style, and starts off. It shows or hides the Direct Sun Hours colouring on the site, together with its legend.
5. Follow-up, 19 Nov 2026: after first accepting the earlier shadow darkness, Kelvin asked to try a version with clearly darker cast shadows: a strong, readable dark grey, not washed-out pale shadows and not a crushed-black or night-like scene.

## How we'll know it works

Open 40 Cleeland St, Dandenong (`?lat=-37.983826&lon=145.21555&label=40+Cleeland+St%2C+Dandenong+VIC+3175&km=1`), go to Solar Study, pick 21 Jun around 15:00, Perspective, Shadows on.

- [ ] In the greyscale Perspective view with Shadows on, shadows on the ground and on buildings are a strong, readable dark grey, with detail still visible in the shade and sunlit roofs and walls staying light, without the scene going muddy or black.
- [ ] Trees, roads, terrain and buildings are grey; switching to Wind Rose brings the colours back.
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
