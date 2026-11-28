# Feature: Viewshed Walk card

## What it does

When Viewshed Walk is on, its controls sit on a card in the right-hand column instead of in the Analysis bar. You draw a path, compute the view, set eye height and radius, play the walk and read the legend, all in one place. Nothing about the viewshed study itself changes.

## What it looks like

Screens this touches: the right-hand column in 3D and Drawing, and the Analysis bar (which loses its viewshed row).

Sketch or screenshot:

The round-3 mock `mock-viewshed-1440.png`. Kelvin's GO: 11:45 AM AEDT, 23 Nov 2026.

### Kelvin's preferences (23 Nov 2026)

1. **A card, not a bar row.** The card shows only while Viewshed Walk is on. It is 328 px wide and in the same style as the Solar Study and Wind Rose cards. Its 48 px header reads "Viewshed Walk" with the live eye height and radius ("1.6 m · 200 m").
2. **Path.** A short hint, then one row of two buttons: **Draw path** and **Compute**. Draw path reads "Drawing path…" while you are placing points. Compute is held until there is a path, reads "Computing 40%" while it runs and "Computed" when the view is ready.
3. **Eye height and Radius** are two rows on a left-aligned label column, each with compact pills: 1.6 / 4.5 / 10 m (starts on 1.6) and 100 / 200 / 400 m (starts on 200). The selected pill is ink with white text.
4. **Walk.** Play, the walk speeds 1× / 4× / 8×, and Clear are on one row. Under them is a full-width slider for the position along the path, with a badge on the left reading "84 / 240 m · 1.6 m · 200 m". Play, Clear and the slider are held until there is something to act on.
5. **Legend.** Visible now / Seen on walk / Not visible / Path sits at the foot of the card. It no longer floats over the viewport.
6. **Accordion.** With other analyses on, the card follows the same rule as the others: all headers stay visible, the analysis turned on last starts open, and clicking a folded header swaps which one is open (`docs/specs/wind-streaks.md`, preference 12).

## How we'll know it works

Open Southbank (`?lat=-37.8216&lon=144.9645&km=0.5`) in 3D and click Viewshed Walk.

- [ ] The Analysis bar is still one row, with no Draw Path, Compute View, eye, radius, speed or slider in it.
- [ ] The Viewshed Walk card is on the right with Draw path / Compute, Eye height, Radius, Play, 1× / 4× / 8×, Clear, the position slider, the badge and the legend, every button on one line.
- [ ] Draw a path and compute it: the badge reads the distance along the path, and Play walks it.
- [ ] Picking 4.5 m and 400 m changes the header to "4.5 m · 400 m".
- [ ] No legend floats over the 3D view.
- [ ] Turning Viewshed Walk off removes the card.

## Out of scope

- No change to how the viewshed is computed, to its colours, or to the path drawing in the 3D view.
- The old sidebar `ViewPanel` is not brought back.

## Estimated runs

- Part of the analysis-cards draft (2–3).
