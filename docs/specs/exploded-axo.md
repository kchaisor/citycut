# Feature: Exploded axo (3D model view)

## What it does

An **Exploded axo** button in the 3D model view lifts the site apart into six stacked layers, with a smooth animation and the camera zooming to fit as it moves. A slider sets the gap between layers. Clicking Perspective, Isometric or Plan puts the layers back together. This is the live 3D view; the Drawing tab's exploded axo export is a separate feature and is unchanged.

## What it looks like

Screens this touches: the 3D model top bar (the Perspective / Isometric / Plan pills), the 3D viewport, and the right-hand card column.

Sketch or screenshot: Paper mock skipped (Paper weekly MCP limit, 24 Nov 2026). See the PR screenshot.

### Kelvin's preferences (24 Nov 2026, plan approved 12:57 AM AEDT)

1. **Button.** An **Exploded axo** pill sits in the top bar's projection group, right after Isometric and before Plan, in the same pill style. It is pressed while the model is exploded. It only shows in the 3D model view.
2. **Six layers, bottom to top:** (1) **Ground**: terrain, base plinth, ground, blocks, site boundary and contours; (2) **Water**; (3) **Parks**: green space, parks, grass and landscape areas; (4) **Roads & transport**: roads, footpaths, car parks, rail and tram lines; (5) **Buildings**: all buildings, including imported massing; (6) **Trees**. The camera is an isometric-style view at the current corner.
3. **It moves.** Clicking Exploded axo animates the layers apart (about 0.9 s, eased), and the camera zooms to fit the whole exploding stack in sync, so nothing leaves the screen at any point.
4. **Labels.** Each layer gets a small floating label, "Ground", "Water", "Parks", "Roads & transport", "Buildings" and "Trees", in the same style as the landmark labels, stacked in one column on the left of the model (see the 24 Nov 2026, 12:07 PM AEDT note). They show while exploded and hide while collapsed.
5. **Analysis overlays travel with their layer.** Sun hours colours on the ground move with Ground, and on roofs and walls with Buildings. Wind arrows and ground flow, contours and the sun dome move with Ground. Shadows stay on and are cast live in the exploded arrangement.
6. **Gap slider in the right-hand cards.** While exploded, an **Exploded axo** card in the right-hand column (not the bottom Analysis bar, which holds only the analysis toggles and High / Fast) has a **Layer gap** slider with a metres readout. The gap is the clear space between one layer's top and the next layer's bottom. Moving it updates the stack live and re-fits the camera to the new extents.
7. **Going back.** Clicking Perspective, Isometric or Plan animates the layers back together, then the chosen view continues from where the collapse ended, with no extra zoom or re-fit (Kelvin, 24 Nov 2026, 1:29 PM AEDT). Perspective keeps the same target and view direction at an equivalent framing. Isometric stays put. Plan looks straight down at the same target and zoom.
8. **Reduced motion.** With the system reduced-motion setting on, the layers and camera jump straight to the end state with no animation.
9. **Nothing else changes.** Building picking and selection, sun hours, the Solar Study toggle, wind and the Drawing tab work as before, exploded or not. Exploded is saved in named views only (not across reloads otherwise): a reload or a new cut opens the model assembled.

### Kelvin's preferences (24 Nov 2026, 11:05 AM AEDT)

1. **Water and Parks are their own layers.** Water sits above Ground and Parks above Water, each with its own label, so lakes, rivers and green space float as separate sheets. A cut with no water, or with Water or Landscape switched off, skips that layer: no label and no extra gap.
2. **Boundary outline on every layer.** Each layer gets a thin dark line tracing the cut boundary (square, round or A3, in the Ground edge colour) at that layer's base, so every floating plane reads as the same site footprint. The outlines move with their layer during the animation and with the gap slider, show only while exploded, and cannot be picked or exported.
3. **Named views save Exploded axo** (24 Nov 2026, 1:29 PM AEDT). A view saved exploded comes back exploded, with its gap and camera, and no animation. A view saved assembled collapses at once.

### Added (24 Nov 2026, 11:49 AM AEDT)

4. **Dashed corner lines.** Thin dashed vertical lines, in the same dark Ground edge colour as the outlines, join each corner of the cut boundary on the bottom layer (Ground) to the same corner on the top layer (Trees), passing through every layer's outline. A square or A3 cut has 4 lines. A cut with many boundary points gets lines only at sharp corners (turns over 30°), and a round cut has none. The lines grow and shrink with the animation and the gap slider, show only while exploded, keep the same dash size on screen at any zoom, and cannot be picked or exported.

### Added (24 Nov 2026, 12:07 PM AEDT)

5. **Labels in one left column.** All six labels are right-aligned in a single column just left of the left-most layer corner on screen. Each label is anchored to the left-most corner of its own layer's boundary outline, at that layer's height, not to the layer's own geometry, so a sparse layer such as Parks lines up with the rest. Each label is centred on its anchor's height, with a thin leader line (Ground edge colour, 1 px) from the label to its corner. Labels that would overlap are pushed apart, in layer order, with a few pixels between them; the leaders still point to the true corners. The column stays inside the free area between the panels, and labels and leaders follow the explode animation, the gap slider, pan and zoom.

### As built (24 Nov 2026)

- **Gap slider.** Opens at 0.3 × the cut side, rounded to 5 m (150 m on a 0.5 km cut, 300 m on a 1 km cut), so the layers read as separate. It runs from 10 m to 0.8 × the cut side (400 m / 800 m) in 5 m steps. The gap choice is not saved either.
- **Labels.** Labels sit in one left column (see the 12:07 PM note) and follow their layers as you pan or zoom. A label never sits under the left panel or rail, the top bar, the right-hand cards or the bottom Analysis bar: it is held inside the free area between them. Labels fade in over the last third of the explode and are hidden the moment a collapse starts.
- **Label placement.** Labels stay inside the frame beside their own layer at any gap, and only panels that sit over the label column push them.
- **Empty layers.** A layer with nothing showing (for example Trees switched off) is skipped: no label and no extra gap.
- **Camera.** Exploding always uses the fixed isometric corner, so it turns Free rotate off. Changing corner while exploded keeps the model exploded and re-fits. You can still pan and zoom by hand once the animation has finished; moving the gap slider re-fits again. The fit places the stack in the part of the view not covered by the on-screen panels (the same free area the sun dome uses), with room on the left for the labels.
- **Analysis toggles.** Switching Solar Study, Sun dome, shadows, Sun hours or Wind Rose on or off does not re-fit the exploded stack or move the camera. The stack only re-fits when it explodes or collapses, the gap or corner changes, or a layer is shown or hidden (Kelvin, 24 Nov 2026 12:53 PM AEDT).
- **Landmark name labels** are hidden while the model is exploded and come back when it is assembled.
- **Picked tree and imported-building cards** stay pinned to the thing they describe as it lifts.
- **Ground under the roads.** Where the site has terrain, roads are cut out of the ground surface. While the model is exploded, the openings are filled in the ground colour on the Ground layer, so the ground reads as whole once the roads lift. The fill is removed when the model is assembled.
- **Timing.** The animation follows real elapsed time, so it takes about 0.9 s even at a low frame rate.
- **Known limits.** The section knife is not adjusted for the exploded arrangement.

## How we'll know it works

- [ ] Clicking Exploded axo animates six labelled layers apart in the right order, and the whole stack stays in view throughout.
- [ ] Dragging Layer gap moves the layers live and the camera re-fits.
- [ ] Clicking Perspective or Isometric animates them back together and re-fits.
- [ ] Sun hours, wind arrows and contours stay on their layers while exploded; clicking a building still selects it.

## Out of scope

- Per-layer show/hide or reorder, further layers, and exporting the exploded 3D view (the Drawing tab has its own exploded axo export).

## Estimated runs

- One Claude Code run (Fable), plus at most one short follow-up run.
