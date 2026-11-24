# Feature: Diagram arrows

Approved by Kelvin, 24 Nov 2026 (9:55 PM AEDT). Built stacked on #291, before the wind drafts merge, knowing it overlaps #288, #290 and #291.

## What it does

An Arrows tool lets Kelvin click points on the ground; a smooth curve (centripetal Catmull-Rom) is drawn through them as a diagram arrow. Each arrow can float at a set height above ground in the 3D view, and draw as a flat vector arrow in the Drawing view. A preset style, colour, width, height and animation speed are chosen per arrow. Arrows carry no labels anywhere. Arrows save with the site and are captured in named views.

Step 1: everything above, static. Step 2 (done, PR #292): animation rendering, described under "Animation" below.

## What it looks like

Screens this touches: 3D view (all projections), Drawing view (site plan), the left tool rail (Arrows button directly under Site, and its panel), the scene layers list (Arrows toggle), named views, static PNG and wind sheet exports, Drawing exports.

Controls:

- Tool: button named "Arrows" in the left tool rail (`aria-label="Model tools"`), directly after Site (Site Intelligence). It is no longer in the bottom bar. A panel opens with: style group (`aria-label="Arrow style"`, eight buttons: Streak, Tapered flow, Bold, Line, Dashed, Dotted, Chevron run, Double, each with a drawn swatch), colour swatches (Ink, Red, Blue, Green, Amber), a Width slider (0.4x to 2.5x), a Height slider (0 to 500 m, 3D), animation picker (None, Streaks, Draw on, Dashes) with an Animation speed slider (0.25x to 3x), pause and play, "Show in 3D" and "Show in Drawing" checkboxes with a note saying whether they apply to "the selected arrow" or "the next arrow", list of arrows with select and delete, "New arrow", and "Done". There is no Label field.
- Placing: click points on the ground, live preview of the curve. Double-click or Enter finishes (needs at least 2 points). Esc cancels the draft. Backspace removes the last placed point.
- Editing: click an arrow to select it. Drag its points to move them. Select a point and press Delete or Backspace to remove it (an arrow keeps at least 2 points). Delete, or the panel button, removes the whole arrow. Click empty space to deselect.
- Panel edits apply to the selected arrow; with nothing selected they set the defaults for the next arrow.
- Height gumball: with an arrow selected in a 3D projection (not Plan), a gumball stands at the arrow's midpoint: a stem to the ground, a ring and up and down cones. Dragging it changes the height on a camera-facing vertical plane, in sync with the Height slider. Hovering or dragging the gumball or a point handle locks OrbitControls so the camera never orbits during the drag, including on `pointercancel`. The gumball is screen-only and never appears in exports.
- Presets, all with no flat or blunt end anywhere (every head is a point, every tail tapers to a point or a V-notch, every dash is a spindle pointed at both ends):
  - `streak`: three or four comets, each a pointed head with a tapering tail that fades out, and no solid body. They sit evenly spaced and static for `none`, paused, reduced motion, exports and swatches.
  - `tapered`: Tapered flow, grows smoothly from a point at the tail to the head base.
  - `bold`: solid body, filled pointed head, tail tapers to a point.
  - `line`: thin line, simple pointed head.
  - `dashed`: pointed spindle dashes, pointed head.
  - `dotted`: round dots, pointed head.
  - `chevron`: Chevron run, a row of chevrons with sharp tips and notches, ending in a larger lead chevron.
  - `double`: heads at both ends.
- Width scales the arrow with the site size; Height and Width are per arrow.
- Colours are design tokens `--arrow-ink`, `--arrow-red`, `--arrow-blue`, `--arrow-green`, `--arrow-amber`, plus `--arrow-handle` for selected points (see THEME.md).
- No labels: no arrow label appears in the panel, 3D, Plan, Drawing, PNG, .svg, .ai or .3dm. Arrows stored with an old `label` field still load; the field is ignored and dropped on the next save.
- Layer toggle "Arrows" in the right panel layers list shows or hides every arrow in both views.

## Animation

Each arrow's `animation` renders live in the 3D view (every projection, floating at its height) and in the Drawing view.

- `none`: static, no frame cost.
- `streaks`: short tapered, lighter streaks flow along the path from tail to head over the static body, looping (the wind flow streak look, in the arrow colour). For the Streak style the comets themselves flow and there is no static body underneath.
- Animation speed is per arrow (`speed`, 0.25x to 3x, default 1x): it scales that arrow's clock only. It applies to the selected arrow, or to the next arrow when none is selected.
- `draw-on`: the body grows from tail to tip over 1.6 s, holds 0.8 s, then repeats. The head appears when the body reaches the tip.
- `dashes`: the body becomes dashes that march towards the head, for any style (the Dashed style's own dashes march).
- One shared wall-clock drives every arrow. 3D requests frames only while a visible arrow animates; Drawing runs one shared `requestAnimationFrame` loop only while a visible arrow animates. Hidden arrows (layer off, per-view toggles) cost nothing.
- `prefers-reduced-motion: reduce` renders every arrow static.
- Exports stay static: PNG, A3 sheets and named-view captures show the full arrow as `none`. The animated 3D meshes are screen-only and the full mesh is export-only, switched by the same screen-only mechanism the capture already uses. Drawing SVG, AI and 3dm downloads are built from model data, never from the live SVG, so they never see an animation frame.
- Pause and play: a toggle named "Pause arrow animation" / "Play arrow animation" (`aria-pressed`) sits under the animation picker in the Arrows panel, in the Arrows panel only. Paused renders every arrow static like reduced motion, in 3D, Plan overlay and Drawing, and stops the frame loops. Kept for the session; exports are unaffected. `window.__citycutDiagramArrowsPaused` mirrors it.
- Drawing downloads (.svg, .ai, .3dm) carry arrows with Show in Drawing on, as static filled shapes on a "Diagram arrows" layer, per-arrow colour, dashes as separate dash shapes. Shapes only, no text. Faded comet bands carry an opacity below one.
- Debug hook: `window.__citycutDiagramArrowsAnim = { animated, t }` (count of animating arrows, shared clock seconds), present only while something animates.

## Data model

Points are stored in site-local metres `[east, north]`, the same ground frame as other site features, so one arrow renders in either view.

```
DiagramArrow {
  id, points: [east, north][] (>= 2),
  style: streak | tapered | bold | line | dashed | dotted | chevron | double,
  colour: ink | red | blue | green | amber,
  width: number 0.4..2.5 (default 1; legacy s, m, l read as 0.55, 1, 1.65),
  heightM (default 20, 0..500, 3D only),
  animation: none | streaks | draw-on | dashes (default none),
  speed: number 0.25..3 (default 1, per arrow),
  showIn3d, showInDrawing (both default true)
}
```

Storage: `citycut.diagramArrows.v1`, `{ version, byCut: { [modelCutSiteId]: DiagramArrow[] } }`, lenient parse (bad arrows are dropped, bad fields fall back to defaults).

Named views: the snapshot gains `arrows: { visible, items } | null`. Saving stores the arrows toggle and the arrow set as of save. Restoring applies both. A view saved before this feature has no `arrows` field; restoring it leaves the current arrows alone.

## How we'll know it works

- [ ] The Arrows button sits right under Site in the left rail and opens the panel; the eight styles are in a group named "Arrow style".
- [ ] Width, Height and Animation speed sliders change the selected arrow; there is no Label field.
- [ ] Dragging the 3D gumball changes the height with the Height slider following, and the camera does not orbit.
- [ ] Show in 3D hides the arrow in 3D, Plan and the PNG; Show in Drawing hides it in Drawing, .svg, .ai and .3dm.
- [ ] No style has a flat or blunt end; Streak shows three or four fading comets and no solid body.
- [ ] Clicking 3+ points on the 3D ground and pressing Enter leaves a smooth arrow through those points at 20 m.
- [ ] Switching to Drawing shows the same arrow as a flat vector arrow in the same place.
- [ ] Dragging a selected arrow's point moves it; Delete removes a selected point or the arrow.
- [ ] Reloading the page keeps the arrows; saving a named view and restoring it brings back that arrow set.
- [ ] PNG export and the A3 wind sheet include the arrows, with no labels.
- [ ] Streaks, Draw-on and Marching dashes animate in 3D and Drawing; exports show the full static arrow; with all arrows on None the scene stays idle.

## Out of scope

- Phone or mobile layouts. Laser cutting and physical export.
- Arrows in the exploded axo and isometric drawings.

## Estimated runs

- Three commits: data, spec and tests; 3D, Drawing and tool; panel and exports.
