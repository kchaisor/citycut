# Feature: Exploded axo (3D model view)

## What it does

An **Exploded axo** button in the 3D model view lifts the site apart into four stacked layers, with a smooth animation and the camera zooming to fit as it moves. A slider sets the gap between layers. Clicking Perspective, Isometric or Plan puts the layers back together. This is the live 3D view; the Drawing tab's exploded axo export is a separate feature and is unchanged.

## What it looks like

Screens this touches: the 3D model top bar (the Perspective / Isometric / Plan pills), the 3D viewport, and the right-hand card column.

Sketch or screenshot: Paper mock skipped (Paper weekly MCP limit, 24 Nov 2026). See the PR screenshot.

### Kelvin's preferences (24 Nov 2026, plan approved 12:57 AM AEDT)

1. **Button.** An **Exploded axo** pill sits in the top bar's projection group, right after Isometric and before Plan, in the same pill style. It is pressed while the model is exploded. It only shows in the 3D model view.
2. **Four layers, bottom to top:** (1) **Ground**: terrain, base plinth, ground, water, landscape and parks, site boundary and contours; (2) **Roads & transport**: roads, footpaths, car parks, rail and tram lines; (3) **Buildings**: all buildings, including imported massing; (4) **Trees**. The camera is an isometric-style view at the current corner.
3. **It moves.** Clicking Exploded axo animates the layers apart (about 0.9 s, eased), and the camera zooms to fit the whole exploding stack in sync, so nothing leaves the screen at any point.
4. **Labels.** Each layer gets a small floating label, "Ground", "Roads & transport", "Buildings" and "Trees", in the same style as the landmark labels. They show while exploded and hide while collapsed.
5. **Analysis overlays travel with their layer.** Sun hours colours on the ground move with Ground, and on roofs and walls with Buildings. Wind arrows and ground flow, contours and the sun dome move with Ground. Shadows stay on and are cast live in the exploded arrangement.
6. **Gap slider in the right-hand cards.** While exploded, an **Exploded axo** card in the right-hand column (not the bottom Analysis bar, which holds only the analysis toggles and High / Fast) has a **Layer gap** slider with a metres readout. The gap is the clear space between one layer's top and the next layer's bottom. Moving it updates the stack live and re-fits the camera to the new extents.
7. **Going back.** Clicking Perspective, Isometric or Plan animates the layers back together and zooms to fit the restored model, then shows the chosen view.
8. **Reduced motion.** With the system reduced-motion setting on, the layers and camera jump straight to the end state with no animation.
9. **Nothing else changes.** Building picking and selection, sun hours, the Solar Study toggle, wind and the Drawing tab work as before, exploded or not. Exploded is not saved: a reload or a new cut opens the model assembled.

### As built (24 Nov 2026)

- **Gap slider.** Opens at 0.15 × the cut side, rounded to 5 m (75 m on a 0.5 km cut, 150 m on a 1 km cut). It runs from 10 m to 0.6 × the cut side (300 m / 600 m) in 5 m steps. The gap choice is not saved either.
- **Labels.** Each label sits just left of its layer, at the bottom corner nearest the left of the screen, and follows the layer as you pan or zoom. Labels fade in over the last third of the explode and are hidden the moment a collapse starts.
- **Empty layers.** A layer with nothing showing (for example Trees switched off) is skipped: no label and no extra gap.
- **Camera.** Exploding always uses the fixed isometric corner, so it turns Free rotate off. Changing corner while exploded keeps the model exploded and re-fits. You can still pan and zoom by hand once the animation has finished; moving the gap slider re-fits again. The fit leaves room at the sides for the labels.
- **Landmark name labels** are hidden while the model is exploded and come back when it is assembled.
- **Picked tree and imported-building cards** stay pinned to the thing they describe as it lifts.
- **Known limits.** Where the site has terrain, roads are cut out of the ground surface, so the Ground layer shows road-shaped openings once the roads lift. The section knife is not adjusted for the exploded arrangement.

## How we'll know it works

- [ ] Clicking Exploded axo animates four labelled layers apart in the right order, and the whole stack stays in view throughout.
- [ ] Dragging Layer gap moves the layers live and the camera re-fits.
- [ ] Clicking Perspective or Isometric animates them back together and re-fits.
- [ ] Sun hours, wind arrows and contours stay on their layers while exploded; clicking a building still selects it.

## Out of scope

- Per-layer show/hide or reorder, extra layers, and exporting the exploded 3D view (the Drawing tab has its own exploded axo export).

## Estimated runs

- One Claude Code run (Fable), plus at most one short follow-up run.
