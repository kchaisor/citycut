# Feature: Terrain contours (1 m everywhere, draft 5)

## What it does

Terrain contours draw the shape of the ground in the 3D model, on the Drawing site plan, in the isometric and exploded axo drawings, and in the exports. Every site now shows a contour every 1 m, with a heavier index contour every 5 m so the drawing stays readable.

## What it looks like

Screens this touches: the 3D model terrain, the Drawing site plan, the isometric drawing, the exploded axo terrain and topography plates, and the Illustrator and Rhino exports.

### Decision (Kelvin, 22 Nov 2026)

Confirmed on 21 Nov 2026 and approved for build on 22 Nov 2026:

- **1 m contours everywhere.** Contours are drawn every 1 m on every site, including where they have to be interpolated from coarser data.
- **Official lines stay official.** City of Sydney 1 m and Vicmap metro 1 m lines are drawn as published. NSW 2 m lines are drawn as published, and the 1 m lines in between (3, 5, 7 m …) are traced from the ground surface the cut already builds from those contours (the Laplace contour field). Outside the City of Sydney on a mixed cut, the same infill fills the NSW part only.
- **DEM-only sites** (Mapterhorn terrain, about 4 m per pixel) are traced every 1 m, whatever the relief. The old relief rule (2, 5 or 10 m on hilly sites) no longer sets the drawn interval.
- **Vicmap statewide 10 m** lines are drawn as published, and the 1 m lines in between are traced from the cut's terrain when there is one.
- **Index contours every 5 m** (`--contour-index-every: 5`) are drawn heavier (`--contour-index-mm`) on the site plan, the isometric drawing, the exploded axo plates, the Illustrator exports, and Rhino (`index` user text). In 3D, index contours are a solid line over the dashed 1 m set.
- **All plan scales draw 1 m**, including 1:2500 and 1:5000. `--contour-coarse-interval-m` is now `1`, so nothing is thinned. Setting it back to `5` restores the old metro thinning at `--contour-coarse-from-scale` and smaller, without touching NSW or DEM sites.
- **Labels tell the truth about the source.** The Display panel names the source and says when the in-between lines are interpolated, for example "NSW Elevation 2 m contours; 1 m lines in between are interpolated" or "derived from terrain DEM, every 1 m".

### Exploded axo transport plate (Kelvin, 22 Nov 2026)

- No source text under the Transport plate. The plate keeps its "Transport" leader label only. The transport data credit goes in the export footer.
- The Train / Tram / Bus legend is not drawn on the plate. On screen it is a Transport legend HUD card in the stage (see DESIGN-SYSTEM.md). In the Illustrator export it sits in the top-left sheet margin.
- If transport data fails, the card (and the export legend) say "Unavailable". No sentence goes on the plate.
- The Planning plate keeps its own in-plate legend.

## How we'll know it works

- [x] On a NSW site, the plan shows a contour every 1 m, not every 2 m, with the official even-metre lines still there.
- [x] On a site that only has Mapterhorn DEM terrain, the plan shows a contour every 1 m, even with more than 8 m of relief.
- [x] Every site, whatever its terrain source, shows 1 m contours at 1:500, 1:1000 and 1:2500.
- [x] Every 5 m contour is heavier on the plan, the exploded axo, the exports, and in 3D.
- [x] The Display panel says where the lines come from and when 1 m lines are interpolated.
- [x] Exploded axo with Transport on shows no source text under the Transport plate, and the Train / Tram / Bus legend sits in a card beside the Display panel.

## Limits

- Interpolated lines are only as good as the surface they come from. NSW infill follows the Laplace field pinned to the official 2 m lines; DEM lines follow 4 m Mapterhorn pixels, so 1 m lines on flat DEM sites can wander.
- Vicmap statewide infill uses the cut's terrain, which is not pinned to those lines, so an interpolated line can sit slightly off between two official 10 m lines.
- Without any terrain surface (for example terrain off on a Vicmap statewide cut), there is nothing to interpolate from, so only the official lines are drawn.
- The 3D view Illustrator export keeps one contour weight.

## Out of scope

- Any contour code in the Analysis bar draft.
- Contour labels (still off on the plan).

## Estimated runs

- This draft, 1–2 runs.
