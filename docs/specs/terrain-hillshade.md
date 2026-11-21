# Feature: Terrain hillshade (draft 6, 22 Nov 2026)

## What it does

The 3D ground gets a soft hill shade so slope reads on the paper ground without changing the model's scale. A **Hillshade** toggle in Display → View Style (next to Outlines) turns it off. It is on by default, including on a new cut.

### Decision (22 Nov 2026)

Kelvin chose this at 8:14 AM AEDT on 22 Nov 2026: "Add soft hill shading to the ground." It answers his 21 Nov note that the Rozelle site "is not as flat as shown in this version".

- **Hillshade, not height exaggeration.** The terrain data is fine (live Rozelle tiles span about 28 m). The 3D model stays at **true scale**; mesh heights and positions do not change. The existing exploded-axo terrain exaggeration slider is untouched.
- **Light from the north-west** (azimuth 315°, sun altitude 50°), Horn slope from the terrain height grid.
- **Low-contrast grey multiply** on the paper ground (`--ground-fill`, and the road-enclosed `--block-fill` ground), clamped to a soft range so it never looks like a GIS relief map or a heatmap. The old elevation ramp is reduced to a whisper (4%); hillshade is the relief cue.
- **Must not fight analysis.** Only the base ground is shaded. Buildings, roads, water, landscape, contours, building shadows, wind streaks and the sun-hours heatmap are never multiplied. While sun hours drapes the ground, hillshade is switched off under it so the heatmap colours stay true.
- **Display toggle, default on.** Saved like the other 3D display flags (`citycut.view3d.hillshade`). With no terrain the toggle still shows; the ground stays the flat slab.

## What it looks like

Screens this touches: the 3D model ground, the Display panel (View Style), and the 3D-view Illustrator `.ai` ground.

Sketch or screenshot: box screenshots use `?qa=1&qaTerrain=ridge` (a synthetic 0.25–28.25 m ridge), because this box cannot load Mapterhorn tiles. Check real Rozelle on the preview: `?lat=-33.867518&lon=151.18298&label=Rozelle+NSW&km=1`.

## How we'll know it works

- [ ] On Rozelle 1 km, slopes facing away from the north-west read as a soft grey on the ground; flat ground looks unchanged.
- [ ] Building heights and the ground's height look the same as before (true scale).
- [ ] Display → View Style shows **Hillshade** next to Outlines, ticked by default; unticking it gives flat paper ground.
- [ ] With Sun hours on, the heatmap colours look the same as with Hillshade off.

## Out of scope

- Height exaggeration of the 3D mesh.
- Drawing site plan wash, figure-ground and exploded axo (not in this draft).
- Rhino `.3dm` ground colours.
- Contour interval or drawing (draft 5).

## Estimated runs

- 1 run (this draft).
