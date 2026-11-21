# Feature: Terrain contours (pending, draft 5)

## What it does

Terrain contours draw the shape of the ground in the 3D model and on the Drawing site plan. This spec only records a decision for a later draft; no contour code changes yet.

## What it looks like

Screens this touches: the 3D model terrain and the Drawing site plan.

### Pending decision (21 Nov 2026)

Kelvin confirmed this on 21 Nov 2026:

- **1 m contours everywhere.** Contours are drawn every 1 m on every site, including where they have to be interpolated from coarser data (the NSW 2 m elevation data or the Mapterhorn DEM).

## How we'll know it works

- [ ] On a NSW site, the plan shows a contour every 1 m, not every 2 m.
- [ ] On a site that only has Mapterhorn DEM terrain, the plan shows a contour every 1 m.
- [ ] Every site, whatever its terrain source, shows 1 m contours.

## Out of scope

- Any contour code in the Analysis bar draft.

## Estimated runs

- To be estimated in draft 5.
