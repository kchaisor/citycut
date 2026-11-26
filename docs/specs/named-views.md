# Feature: Named views and viewport export

## What it does

A **Views** tab in the left toolbar lets you save the current camera and everything that is switched on, under a name, then jump back to that view later. You can export the views you tick, or all of them, as PNG images of exactly what is in the display viewport. Saved views stay after a reload, and each site or cut keeps its own list.

## What it looks like

Screens this touches: the left tool rail (Display, Site, Import, and the new Views button) and a Views card panel in the same style as Import.

Sketch or screenshot: no Paper mock (Paper weekly limit still in force, 24 Nov 2026). See the PR screenshot.

### Kelvin's preferences (24 Nov 2026, plan approved 8:17 AM AEDT)

1. **A saved view remembers the camera and what's switched on.** The camera includes position, target, Perspective / Isometric / Plan mode, and zoom. It also remembers the analysis toggles (Solar Study, Wind Rose, Viewshed Walk and their settings such as season, time of day, overlays and High / Fast), the display settings, and whether the viewport is in Satellite, 3D model or Drawing mode. Clicking a saved view restores all of it.
2. **Export saves PNGs of the display viewport.** The image is exactly what is in the 3D canvas as shown, including analysis overlays, not the app chrome around it. You can export the views you tick, or all saved views at once. Files are named after the views. Several files download as a zip (one PNG if only one view is exported). The capture is of the live viewport as displayed, not the publication export.
3. **Views tab in the left toolbar.** A Views button sits in the thin vertical icon column at the top left, with Display, Site and Import. It opens a white card panel titled **Views**, in the same style as Import (small uppercase section headers, and a yellow active button). The panel has a name field and **Save current view**, plus rename, delete, tick boxes, **Export selected** and **Export all**.
4. **Saved views persist after a reload, separate per site or cut.** They are kept in localStorage. A different site, or a different cut size at the same place, has its own list.

5. **Every study and camera restores and exports.** A saved view brings back and exports wind (Flow, Streaks, the Plan heatmap in speed or comfort with its wind ticks, season, time of day, design winds) and sun hours (on, Whole day or 9-3 window, colour only selected, High / Fast, date), plus Shadows and the Sun dome, in Perspective, Isometric and Plan. Satellite views restore but do not export.
6. **Export waits until the studies are ready.** Sun hours and the wind plan field recompute after a restore, so the export waits until they report ready rather than for a fixed delay.
7. **High quality, transparent.** A toggle in the Export PNG section, for both Export selected and Export all, renders at 2x or more (3x, capped by the graphics card) on a transparent background, with the same visible-area crop.
8. **Exports match what you see between the panels.** The PNG is cropped to the free area between the left rail and cards, right cards, top bar and bottom Analysis bar, and building height labels are drawn at full opacity at the output scale.

### Kelvin's preferences (24 Nov 2026, 1:29 PM AEDT)

9. **Named views save and restore the exploded axo.** On or off, the layer gap, the corner and the layer labels come back with the camera, landing directly in the finished exploded arrangement with no animation. A view saved assembled collapses at once when clicked while exploded. Views saved before this load as not exploded.
10. **Export selected and Export all capture exploded views as shown and never collapse them.** An exploded view exports exploded (labels, outlines, corner lines and layer gap), an assembled view exports assembled, whatever the current state. Export waits for the stack to be fully in place, nothing animates, and the view you were on, exploded or not, is put back afterwards.
11. **Export restores your exact view, with no animation.** After any export the tab, projection, exploded state and gap, and the camera position, target and zoom are back exactly as before, and the restore never plays a collapse or re-fits the camera.

### Kelvin's preference (24 Nov 2026, 3:21 PM AEDT)

12. **Plan wind views export as an A3 sheet with the wind rose beside the map.** When you export a named view that is in Plan with Wind Rose on, the PNG is an A3 landscape sheet: the plan wind map on the left and, in a column on the right, the site name and view name, the wind rose for the season and time of day saved in that view, the speed scale, prevailing wind and calm, the plan legend, and the station and "Indicative only, not a CFD study" notes. These are for exported named views only, so the on-screen view and every other export stay as they are.

### Out of scope

- Sharing views between computers or accounts, cloud sync, and embedding views in a URL.
- Exporting the left or right panels, the top bar, or the bottom Analysis bar as part of the PNG.

## How we'll know it works

- [ ] Saving a view, reloading the page, and clicking the view brings back the camera and the switched-on analysis, display and Satellite / 3D / Drawing settings.
- [ ] Two different cuts keep separate lists.
- [ ] Export selected downloads only the ticked views; Export all downloads every saved view for this cut. One view is a PNG; more than one is a zip of PNGs named after the views.
- [ ] Exporting a Plan view with Wind Rose on (for example "WS - Spring", Morning) gives an A3 landscape PNG with the map and that view's own wind rose, season and time of day; other views export as before.
- [ ] The Views tab opens a panel that matches the Import card style.

## Estimated runs

- One Claude Code run (Sonnet), plus at most one short follow-up run.

## As built

- **Where it lives.** Views is the fourth left-rail button (after Import) and opens a white card panel in the Import style. Saved views are kept in the browser (`citycut.namedViews.v1`), one list per site and cut size (latitude, longitude and cut size). Newest first. Duplicate names are allowed.
- **What a view remembers.** Camera position, target and zoom, Perspective / Isometric / Plan and the isometric corner, 3D / Drawing / Satellite (and which drawing), Solar Study, Wind Rose and Viewshed Walk on/off with their settings (date, time, sun path, shadows, sun study, sun hours and window, wind season, design wind and time of day, wind streaks, sun dome size), High / Fast, picked sun-study buildings, all Display settings, colour by use, source colours, hidden building uses, landmark labels and drawing line styles.
- **Viewshed.** Only eye height and radius are stored. The walk path itself is not saved, because the walk tool does not expose its points.
- **Not remembered.** Open panels, selections, pop-ups and busy states. A saved Drawing view of the exploded axo comes back as the site plan.
- **Restoring.** Clicking a view name switches the mode and settings, then puts the camera back after the view has been fitted, so the automatic fit does not overwrite it.
- **Exploded axo.** The snapshot stores exploded on/off and the layer gap (`exploded`, `explodeGapM`). Restoring an exploded view sets isometric, the corner, exploded and the gap (clamped to the cut's range) and lands in the finished stack, with the saved camera applied after the stack has landed. Export waits for `data-explode-progress` to reach 1 (or 0 for an assembled view), and the layer labels and leader lines are drawn into the PNG as they sit on screen.
- **Export.** One ticked view downloads as `<view name>.png`. Two or more download as one zip, `citycut-<place>-<lat>-<lon>-<size>m-views.zip`, of PNGs named after the views (a repeated name gets `-2`, `-3`). Each PNG is a WYSIWYG capture of the live viewport: the same camera, materials, background and overlays as on screen (sun hours, wind, sun dome, landmark labels), at the canvas's own pixel size, with no app chrome. It does not use the publication 2x PNG pipeline. The app restores each view in turn, waits for it to settle (about a second when sun hours, sun study, wind, viewshed or landmark labels are on), captures it, and finally puts back the view you were on.
- **Drawing and Satellite views.** They can be saved and restored, but not exported as PNG in this pass: the PNG export only covers the 3D canvas, and a clean capture of the drawing or map without the surrounding panels is not reliable yet. Those rows say "restore only", Export skips them, and the panel says how many were skipped.
- **Studies (round 2).** The snapshot also stores the wind plan heatmap mode (speed or comfort), wind ticks on/off and the selected wind sector. Older saved views open with speed, ticks on and the prevailing sector. Sun hours settings (on, window, colour only selected, date, shadows, dome, High / Fast) were already part of the snapshot and are covered by tests.
- **Wait for ready.** After a restore the app polls until sun hours report not pending (ground and building faces) and, in Plan with Wind Rose on, until the wind plan field reports ready, twice in a row, then waits a couple of frames to paint. It gives up after 60 s and captures what is ready. Landmark labels and the viewshed get a few extra frames.
- **High quality, transparent.** The renderer pixel ratio is raised to 3x (never above 8192 px or the GPU texture limit), the scene background and clear alpha are set to 0, the frame is captured, then the live view is put back. The PNG keeps its alpha channel and has no background plate. The top-bar Quick export 2x PNG path is untouched.
- **Crop.** The free rectangle is found from the left rail, floating cards, top bar and bottom bar boxes on screen (each overlapping panel trims the side that loses least). Both the normal and the high quality export use it; high quality is that rectangle times the scale.
- **Overlays in the PNG.** The wind plan heatmap is a DOM canvas over the 3D canvas, so it is drawn into the PNG after the 3D frame. Landmark height pills are drawn at full opacity at the output scale. The compass N/S/E/W and sun dome date marks are 3D sprites, so they are already in the render.
- **Known gaps.** The wind plan canvas is drawn at its on-screen resolution, so it is softer than the 3D render in high quality. Dome sprite text is also rasterised at on-screen resolution. Satellite and Drawing views remain restore only.
- **Sun dome and wind streaks in 3D exports.** 3D exports include the sun dome and wind streaks (the same post-overlay objects you see on screen), in both normal and HQ modes, for the current view and for a restored saved view. The capture render enables the post-overlay layer on the camera for that frame, because the studio post pass hides it from the live camera while it draws them separately.
- **A3 wind sheet.** A saved view with 3D, Plan and Wind Rose on exports as an A3 landscape sheet (`src/lib/windSheet.ts`): 2480 x 1754 px (150 dpi), or 4961 x 3508 px (300 dpi) with no page fill for High quality, transparent. **Map crop.** The sheet does not use the HUD-free crop. The capture takes the largest rectangle with the map area's aspect that fits inside the full canvas, placed as close as it can get to the centre of the HUD-free rect (`sheetCropRect`, capture option `crop: { aspect, minWidthPx }`). It is rendered at a pixel ratio that reaches at least the map area's pixel width (normal) or the High quality map width, capped by the 8192 px / GPU texture limit, with the wind plan canvas drawn into the same crop. Plain named-view and Quick exports keep the HUD-free crop unchanged (no `crop` option is passed). The captured map is trimmed to its content bounds (pixels that are not the page colour, or alpha above 0 for High quality) and contain-fitted into the map area, with the hairline frame drawn tight around it and the scale bar carried through the trim and fit scale. The right column holds the site name (largest type) and view name, the wind rose, a "Rings 33% / 66%" key under the rose (the ring labels are not drawn on the rose, so they cannot meet the hub or wedges), the "Spring · Morning" style label, prevailing wind and calm, the speed scale, the plan legend (speed or comfort), a north arrow and scale bar, and the station, source and CFD notes pinned to the bottom. **Scale bar.** Metres across the crop come from the orthographic plan camera at capture ((top - bottom) / zoom per canvas pixel, times the crop width), so the bar is right for the drawn map; its length is the round value (1, 2, 2.5 or 5 x 10^n m) nearest 17.5% of the map width, in four alternating ink and paper segments. **North arrow.** World north (-Z) is projected into screen space with the captured camera (`northAngleRad`), so it follows the camera's real orientation. With no orthographic camera, both are skipped, and so are they if they cannot fit above the notes. **Type.** The smallest text is 18 px at 2480 px wide and scales with the sheet; steps keep the 1.25 ratio and the title is the top level. The rose, season and time of day come from that view's own saved values (`wind.period`, `wind.daypart`, design wind), not from the screen. The snapshot parser now validates those fields and older views open as Annual and All day with no design wind. With no wind data the view exports as the plain PNG. The Quick export 2x PNG, Rhino and `.ai` are untouched.
