# Feature: Combined analyses and wind streaks

## What it does

Solar Study, Wind Rose and Viewshed Walk can be on at the same time. With Wind Rose on, the 3D view can show a small diagram of the three most common wind directions for the chosen season: fans of slim, curved, tapered arrows lying flat in the model a few metres above the roofs. This is a diagram of climate averages from the weather station named on the Wind Rose card. It is not a CFD study and it is not live wind.

## What it looks like

Screens this touches: the Analysis bar, the 3D model (Perspective and Isometric), the Wind Rose card and the right-hand column.

Sketch or screenshot:

Kelvin's hand-drawn arrow reference (9:17 AM AEDT, 23 Nov 2026) and the 1440 mock `arrows-ref-1440.png`. Build go: Kelvin, 9:40 AM AEDT, 23 Nov 2026 ("ok lets build").

### Kelvin's preferences (23 Nov 2026)

1. **Analyses are combinable.** Solar Study, Wind Rose and Viewshed Walk are independent on/off toggles. Clicking one never turns another off. This replaces the pick-one rule (solar-study spec item 8, rewritten the same day).
2. **The bar gains a row instead of swapping.** With Solar Study and Wind Rose on, the bar is three rows at 1280 and 1440: modes and solar chips, with High / Fast pinned top-right; dates and the time slider; wind seasons, design winds, then 3D Wind Flow, Wind streaks and Pause at the end of the wind row. The time readout is never clipped. To hold three rows, the solar ALT / AZ / DAYLIGHT text is hidden below 1600 wide while two analyses are on, the PREVAILING / MEDIAN / CALM text is not shown beside the solar rows (it stays on the top row when Wind Rose is on alone), the old wind readout pill on the wind row is gone, and the left drawer stops 16 above the bar and scrolls inside itself so the bar can use the space under it.
3. **The selected date and season are ink with white text**, not yellow. Yellow stays on the analysis modes, the overlay chips, 3D Wind Flow, Wind streaks and High / Fast.
4. **Wind streaks is its own chip, separate from 3D Wind Flow.** 3D Wind Flow shows or hides the ground-flow (its density slider stays on the Wind Rose card). Wind streaks shows or hides the diagram arrows. Turning Wind Rose on turns both on. Turning one off hides only that one, and the Wind Rose card stays up either way.
5. **One Play / Pause for both.** It sits at the end of the wind row and freezes or resumes the ground-flow and the arrows together, so a still view can be exported. With reduced motion set on the computer it starts paused; Play, or "Animate anyway" on the slider, starts it.
6. **Flat arrows in perspective, in fans, with no shadows.** Each arrow is a flat, zero-thickness shape: a hairline tail, a slightly thicker neck and a sharp, narrow head, some slightly barbed. Shafts are gentle single C or S swoops, not straight rulers and not sun-dome arcs. They lie on one level a few metres above the typical roofs and foreshorten with the camera; taller towers stand in front of them. No extrusion, tubes, side faces, shading, cast shadows, chevrons or ink outline.
7. **One fan per direction, kept apart.** One fan of 3 to 5 arrows for each of the top three directions, of different lengths and curves, entering from the upwind side and spreading out. The strongest direction gets five arrows and the longest reach; the weakest three and shorter. At most 12 arrows in all. The built arrows are bolder than the mock, and the three fans sit in separate bands so no group cuts across another.
8. **Where the directions come from.** The three most frequent of the 16 compass sectors in the Wind Rose data for the selected option (Annual, Summer, Autumn, Winter or Spring), ranked by how often the wind blows from there, with mean speed breaking a tie. A third direction that is much quieter than the first (under a quarter of it, or under one sixteenth of windy hours) is left out. A north wind flows toward the south. With a design wind selected there is one fan, from that design direction at its own speed. There are no month options.
9. **Three soft colours that stay on in B&W.** Strongest `--wind-stream-1` `#6D9BC7` (dusty blue), second `--wind-stream-2` `#8FBEA3` (sage), third `--wind-stream-3` `#C3A6CF` (lilac). They do not go grey in the B&W View Style. Coral, red, orange, pink, navy and azure are avoided because they clash with the building uses and water.
10. **The arrows travel in a loop.** Kelvin, 11:45 AM AEDT, 23 Nov 2026: "animate them moving into the direction, disappearing and then new arrows come again in a loop". This replaces the earlier soft pulse along a fixed shaft.
    - Each arrow drifts downwind along its own curved path. It fades in at the upwind start, growing out of the edge head first, slides toward the far side, and fades to nothing at the far side or the cut edge. A new arrow then fades in at the upwind start.
    - The arrows in a fan are staggered evenly, so every fan always has a fully visible arrow. A whole fan never pops at once, and the three fans do not pop together.
    - Speed follows each direction's mean speed loosely and stays calm: one loop takes 6 to 11 seconds (28 divided by the mean speed in m/s, kept inside that range), so a faster direction loops sooner.
    - No arrow travels past the cut. Every pose, moving or still, stays inside the site, about 7% of the half-width in from the edge so a head never pokes out. An arrow that would have started or ended outside is slid back inside along its own path.
    - A travelling arrow stops and fades before it would cut across another fan (preference 7 still holds while they move).
    - Pause freezes the arrows where they are, and Play carries on from there. With reduced motion set, they start paused in a still pose with every arrow fully visible, not caught mid-fade. The still pose is the arrangement from preferences 6 and 7.
    - The 2× PNG and the Rhino `.3dm` always use that still pose with every arrow fully visible, whatever the animation is doing at the time.
    - Changing the season rebuilds the fans at once, with no animated change. The arrow shapes, colours and fan counts do not change.
11. **Wind Rose card.** The rose is at least 176 px wide. Under the velocity scale a "Prevailing streams" list reads "From N · 3.6 m/s" for each direction, with a small flat arrow swatch in the same fill and no ink edge. The station line (name, distance, years) stays.
12. **Right-hand column.** While the Wind Rose card is open, Site Intelligence folds to its 48 px header; clicking the header opens it again. The column is never taller than the window minus 80 px, the Wind Rose card scrolls inside itself when it is short of room, and it is not cut off at 1280 or 1440. The Direct Sun Hours card still stacks under it when Sun hours is on.
13. **Compass letters stay readable.** The sun dome's N / E / S / W and other labels are drawn above the arrows with their halo; the arrows are drawn above the dome's lines.

## How we'll know it works

Open Southbank (`?lat=-37.8216&lon=144.9645&km=0.5`) in 3D.

- [ ] Click Solar Study, then Wind Rose: both stay on, the shadows and dome stay, and the bar is three rows at 1440×900 and 1280×800 with High / Fast top-right and the time readout whole.
- [ ] Turn both off: the bar stays, with the solar controls muted.
- [ ] Solar Study alone and Wind Rose alone are each two rows.
- [ ] Three fans of flat arrows show in blue, sage and lilac, 12 arrows at most, none cutting across another fan, and towers hide the parts behind them.
- [ ] Choose B&W in View Style: the city goes grey and the arrows keep their colours.
- [ ] 3D Wind Flow off hides only the ground-flow; Wind streaks off hides only the arrows; the Wind Rose card stays.
- [ ] Pause stops both animations; Play starts them again. With reduced motion on, they start paused.
- [ ] The arrows drift downwind along their curves, fade out toward the far side and fade back in at the upwind side, a few at a time, taking several seconds per loop. None runs past the cut edge.
- [ ] Pause holds the arrows exactly where they are; Play carries on from there. With reduced motion on, every arrow is still and fully visible.
- [ ] Pause mid-fade, then download the 2× PNG: every arrow is fully visible in the image. With Wind streaks on, the Rhino `.3dm` has a "Wind streaks" layer with the same still arrows as flat meshes in "Stream 1" to "Stream 3"; with Wind streaks off it has none.
- [ ] The Wind Rose card lists "From N · 4.8 m/s" style lines that change with the season, Site Intelligence shows only its header, and nothing in the right-hand column is cut off.
- [ ] Opening Site Intelligence does not move the bar.

## Out of scope

- No CFD and no live wind. No month options.
- No change to the ground-flow model or its streak cap.
- No arrows in Drawing, Plan wind maps or `.ai`. The 2× PNG and the Rhino `.3dm` do include them, as a still frame with every arrow fully visible (preference 10); nothing is animated in the `.3dm`.
- No side-panel HUD work (a separate job).
- Thinning the sun dome's lines while the arrows are on (allowed by the plan, not needed so far).

## Estimated runs

- 2–3
