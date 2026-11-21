# Feature: Rhino import keeps its structure

## What it does

When Kelvin imports his own Rhino `.3dm`, CityCut keeps the file's buildings, layers and attributes instead of turning the whole file into one solid lump. Each building in the file becomes a proper CityCut building: it has a height, a use colour and a popover, it draws as its own footprint in the plan, and it can be shown, hidden or coloured on its own. This is the first step to using CityCut to analyse his own schemes.

## What it looks like

Screens this touches:

- **Import panel (Buildings, left sidebar):** under each imported file, a list of the buildings found in it, grouped by layer, with a count, a show/hide toggle and a colour per building. The file-level placement controls (MGA or click to place, easting, northing, base, rotation) stay as they are and move every building in the file together.
- **Building popover:** clicking an imported building shows its name, layer, use, height (top minus base, in metres), levels when the file gives them, and "Source: your model (<file name>)".
- **3D and Drawing:** imported buildings take their use colour, like map buildings, unless a colour is set on the file or the building. The plan draws one footprint per building, not one per file.
- **Import notes:** the existing notes under each file also say how the buildings were grouped (for example "12 buildings from layers" or "1 building: no layers or attributes").

Sketch or screenshot:

<!-- drop a sketch or screenshot here -->

### How buildings are found in a file

Every mesh, extrusion and polysurface is read as today. Each object is then put in a building by the first rule that applies:

1. **User text.** An object with a `building` user text key belongs to the building with that name. Optional keys: `use` (residential, commercial, retail, mixed use, industrial, civic, recreation) and `levels` (a whole number).
2. **Layer.** Otherwise the object belongs to a building named after its layer (the full layer path, so `Scheme A::Tower B` and `Scheme B::Tower B` stay apart). If the layer name contains a use word (for example "Residential" or "Retail"), that is the use.
3. **Nothing to go on.** A file with no layers beyond the default and no user text stays one building named after the file, which is today's behaviour.

Values the file does not give are left empty, not guessed: no use means "unclassified", no `levels` means the popover shows no levels.

## How we'll know it works

Tick these on the real desktop view, with a test `.3dm` that has three buildings on three layers, one with `building`, `use` and `levels` user text:

- [ ] The import panel lists three buildings under the file, with their layer names.
- [ ] Clicking each building in 3D shows its own name, use, height and (for the one with user text) levels, with "Source: your model".
- [ ] The plan shows three footprints, not one merged outline.
- [ ] Hiding one building hides it in 3D, Drawing, shadows, wind and exports; the other two stay.
- [ ] Moving or rotating the file moves all three together.
- [ ] A file with no layers or user text imports exactly as it does today.
- [ ] Models already saved in the browser still load, as one building each, with no errors.
- [ ] typecheck, test, build and verify:ui pass, with desktop screenshots attached.

## Out of scope

- Remembering models by location instead of by the cut's centre (separate follow-up).
- Other file formats (glTF, IFC, SketchUp), a shareable project file, and scheme-vs-scheme comparison.
- Floor area (GFA) and per-level analysis; this feature only reads `levels` for display.
- Block instances, which are still left out with a note to explode them in Rhino.
- Uploading models anywhere. Files stay in this browser.

## Estimated runs

- 2–3: reading layers and user text with per-building tests, then the panel, popover, colours and plan (UI, with screenshots).
