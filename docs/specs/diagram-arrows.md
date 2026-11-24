# Feature: Diagram arrows

Approved by Kelvin, 24 Nov 2026 (9:55 PM AEDT). Built stacked on #291, before the wind drafts merge, knowing it overlaps #288, #290 and #291.

## What it does

An Arrows tool lets Kelvin click points on the ground; a smooth curve (centripetal Catmull-Rom) is drawn through them as a diagram arrow. Each arrow can float at a set height above ground in the 3D view, and draw as a flat vector arrow in the Drawing view. A preset style, colour, width and optional label are chosen per arrow. Arrows save with the site and are captured in named views.

Step 1: everything above, static. Step 2 (done, PR #292): animation rendering, described under "Animation" below.

## What it looks like

Screens this touches: 3D view (all projections), Drawing view (site plan), the left tool rail (new Arrows button and panel), the scene layers list (Arrows toggle), named views, static PNG and wind sheet exports, Drawing exports.

Controls:

- Tool: button named "Arrows" in the tools group. A panel opens with: style group (`aria-label="Arrow style"`, buttons Streak, Bold, Line, Dashed, Double, each with a drawn swatch), colour swatches (Ink, Red, Blue, Green, Amber), width (S, M, L), height in metres (3D), label text, animation picker (None, Flowing streaks, Draw-on, Marching dashes), "Show in 3D" and "Show in Drawing" checkboxes, list of arrows with select and delete, "New arrow", and "Done".
- Placing: click points on the ground, live preview of the curve. Double-click or Enter finishes (needs at least 2 points). Esc cancels the draft. Backspace removes the last placed point.
- Editing: click an arrow to select it. Drag its points to move them. Select a point and press Delete or Backspace to remove it (an arrow keeps at least 2 points). Delete, or the panel button, removes the whole arrow. Click empty space to deselect.
- Panel edits apply to the selected arrow; with nothing selected they set the defaults for the next arrow.
- Presets: `streak` (tapered, like the wind flow arrows), `bold` (solid body, filled head), `line` (thin line, simple head), `dashed` (dashed line, head), `double` (heads at both ends).
- Colours are design tokens `--arrow-ink`, `--arrow-red`, `--arrow-blue`, `--arrow-green`, `--arrow-amber`, plus `--arrow-handle` for selected points (see THEME.md).
- Label: optional text at the arrow's midpoint. 3D: screen-facing HUD label (and drawn into PNG exports). Drawing: SVG text in the plan label style.
- Layer toggle "Arrows" in the right panel layers list shows or hides every arrow in both views.

## Animation

Each arrow's `animation` renders live in the 3D view (every projection, floating at its height) and in the Drawing view.

- `none`: static, no frame cost.
- `streaks`: short tapered, lighter streaks flow along the path from tail to head over the static body, looping (the wind flow streak look, in the arrow colour).
- `draw-on`: the body grows from tail to tip over 1.6 s, holds 0.8 s, then repeats. The head appears when the body reaches the tip.
- `dashes`: the body becomes dashes that march towards the head, for any style (the Dashed style's own dashes march).
- One shared wall-clock drives every arrow. 3D requests frames only while a visible arrow animates; Drawing runs one shared `requestAnimationFrame` loop only while a visible arrow animates. Hidden arrows (layer off, per-view toggles) cost nothing.
- `prefers-reduced-motion: reduce` renders every arrow static.
- Exports stay static: PNG, A3 sheets and named-view captures show the full arrow as `none`. The animated 3D meshes are screen-only and the full mesh is export-only, switched by the same screen-only mechanism the capture already uses. Drawing SVG, AI and 3dm downloads are built from model data, never from the live SVG, so they never see an animation frame.
- Debug hook: `window.__citycutDiagramArrowsAnim = { animated, t }` (count of animating arrows, shared clock seconds), present only while something animates.

## Data model

Points are stored in site-local metres `[east, north]`, the same ground frame as other site features, so one arrow renders in either view.

```
DiagramArrow {
  id, points: [east, north][] (>= 2),
  style: streak | bold | line | dashed | double,
  colour: ink | red | blue | green | amber,
  width: s | m | l,
  heightM (default 20, 0..500, 3D only),
  label (<= 60 chars),
  animation: none | streaks | draw-on | dashes (default none),
  showIn3d, showInDrawing (both default true)
}
```

Storage: `citycut.diagramArrows.v1`, `{ version, byCut: { [modelCutSiteId]: DiagramArrow[] } }`, lenient parse (bad arrows are dropped, bad fields fall back to defaults).

Named views: the snapshot gains `arrows: { visible, items } | null`. Saving stores the arrows toggle and the arrow set as of save. Restoring applies both. A view saved before this feature has no `arrows` field; restoring it leaves the current arrows alone.

## How we'll know it works

- [ ] Arrows button opens the panel; Streak, Bold, Line, Dashed, Double are in a group named "Arrow style".
- [ ] Clicking 3+ points on the 3D ground and pressing Enter leaves a smooth arrow through those points at 20 m.
- [ ] Switching to Drawing shows the same arrow as a flat vector arrow in the same place.
- [ ] Dragging a selected arrow's point moves it; Delete removes a selected point or the arrow.
- [ ] Reloading the page keeps the arrows; saving a named view and restoring it brings back that arrow set.
- [ ] PNG export and the A3 wind sheet include the arrows and their labels.
- [ ] Streaks, Draw-on and Marching dashes animate in 3D and Drawing; exports show the full static arrow; with all arrows on None the scene stays idle.

## Out of scope

- Phone or mobile layouts. Laser cutting and physical export.
- Arrows in the exploded axo and isometric drawings.

## Estimated runs

- Three commits: data, spec and tests; 3D, Drawing and tool; panel and exports.
