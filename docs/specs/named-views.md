# Feature: Named views and viewport export

## What it does

A **Views** tab in the left toolbar lets you save the current camera and everything that is switched on, under a name, then jump back to that view later. You can export the views you tick, or all of them, as PNG images of exactly what is in the display viewport. Saved views stay after a reload, and each site or cut keeps its own list.

## What it looks like

Screens this touches: the left tool rail (Display, Site, Import, and the new Views button) and a Views card panel in the same style as Import.

Sketch or screenshot: no Paper mock (Paper weekly limit still in force, 24 Nov 2026). See the PR screenshot.

### Kelvin's preferences (24 Nov 2026, plan approved 8:17 AM AEDT)

1. **A saved view remembers the camera and what's switched on.** The camera includes position, target, Perspective / Isometric / Plan mode, and zoom. It also remembers the analysis toggles (Solar Study, Wind Rose, Viewshed Walk and their settings such as season, time of day, overlays and High / Fast), the display settings, and whether the viewport is in Satellite, 3D model or Drawing mode. Clicking a saved view restores all of it.
2. **Export saves PNGs of the display viewport.** The image is exactly what is in the 3D canvas as shown, including analysis overlays, not the app chrome around it. You can export the views you tick, or all saved views at once. Files are named after the views. Several files download as a zip (one PNG if only one view is exported). Reuse the existing 2x PNG export pipeline.
3. **Views tab in the left toolbar.** A Views button sits in the thin vertical icon column at the top left, with Display, Site and Import. It opens a white card panel titled **Views**, in the same style as Import (small uppercase section headers, and a yellow active button). The panel has a name field and **Save current view**, plus rename, delete, tick boxes, **Export selected** and **Export all**.
4. **Saved views persist after a reload, separate per site or cut.** They are kept in localStorage. A different site, or a different cut size at the same place, has its own list.

### Out of scope

- Exploded axo state is not saved or restored (that draft is on hold and this work branches off main).
- Sharing views between computers or accounts, cloud sync, and embedding views in a URL.
- Exporting the left or right panels, the top bar, or the bottom Analysis bar as part of the PNG.

## How we'll know it works

- [ ] Saving a view, reloading the page, and clicking the view brings back the camera and the switched-on analysis, display and Satellite / 3D / Drawing settings.
- [ ] Two different cuts keep separate lists.
- [ ] Export selected downloads only the ticked views; Export all downloads every saved view for this cut. One view is a PNG; more than one is a zip of PNGs named after the views.
- [ ] The Views tab opens a panel that matches the Import card style.

## Estimated runs

- One Claude Code run (Sonnet), plus at most one short follow-up run.

## As built

- **Where it lives.** Views is the fourth left-rail button (after Import) and opens a white card panel in the Import style. Saved views are kept in the browser (`citycut.namedViews.v1`), one list per site and cut size (latitude, longitude and cut size). Newest first. Duplicate names are allowed.
- **What a view remembers.** Camera position, target and zoom, Perspective / Isometric / Plan and the isometric corner, 3D / Drawing / Satellite (and which drawing), Solar Study, Wind Rose and Viewshed Walk on/off with their settings (date, time, sun path, shadows, sun study, sun hours and window, wind season, design wind and time of day, wind streaks, sun dome size), High / Fast, picked sun-study buildings, all Display settings, colour by use, source colours, hidden building uses, landmark labels and drawing line styles.
- **Viewshed.** Only eye height and radius are stored. The walk path itself is not saved, because the walk tool does not expose its points.
- **Not remembered.** Open panels, selections, pop-ups and busy states. Exploded axo is never saved or restored; a saved Drawing view of the exploded axo comes back as the site plan.
- **Restoring.** Clicking a view name switches the mode and settings, then puts the camera back after the view has been fitted, so the automatic fit does not overwrite it.
- **Export.** One ticked view downloads as `<view name>.png`. Two or more download as one zip, `citycut-<place>-<lat>-<lon>-<size>m-views.zip`, of PNGs named after the views (a repeated name gets `-2`, `-3`). Each PNG is the existing 2x 3D export, so it includes sun hours, wind, sun dome and landmark labels and leaves out the app panels. The app restores each view in turn, waits for it to settle (about a second when sun hours, sun study, wind or viewshed are on), captures it, and finally puts back the view you were on.
- **Drawing and Satellite views.** They can be saved and restored, but not exported as PNG in this pass: the PNG export only covers the 3D canvas, and a clean capture of the drawing or map without the surrounding panels is not reliable yet. Those rows say "restore only", Export skips them, and the panel says how many were skipped.
