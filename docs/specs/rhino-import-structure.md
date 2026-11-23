# Feature: Rhino import keeps its structure

## What it does

When Kelvin imports his own Rhino `.3dm`, CityCut keeps the file's buildings, layers and attributes instead of turning the whole file into one solid lump. Each building in the file becomes a proper CityCut building: it has a height, a use colour and a popover, it draws as its own footprint in the plan, and it can be shown, hidden or coloured on its own. This is the first step to using CityCut to analyse his own schemes.

## What it looks like

Screens this touches:

- **Import panel (Buildings, left sidebar):** under each imported file, a list of the buildings found in it, grouped by layer, with a count, a show/hide toggle and a colour per building. The list shows short names under a scheme heading (for example Tower A under Scheme A). The file-level placement controls (MGA or click to place, easting, northing, base, rotation) stay as they are and move every building in the file together.
- **Building popover:** clicking an imported building shows its name, layer, use, height (top minus base, in metres), levels when the file gives them, and "Source: your model (<file name>)".
- **3D and Drawing:** imported buildings take their use colour, like map buildings, unless a colour is set on the file or the building. A colour set on the file recolours every building in that file, and overrides use colours. When no file colour is set, buildings use their use colour, or the unclassified grey if they have no use. The plan draws one footprint per building, not one per file.
- **Import notes:** the existing notes under each file also say how the buildings were grouped (for example "12 buildings from layers" or "1 building: no layers or attributes").

Sketch or screenshot:

<!-- drop a sketch or screenshot here -->

### How buildings are found in a file

Every mesh, extrusion and polysurface is read as today. Each object is then put in a building by the first rule that applies:

1. **User text.** An object with a `building` user text key belongs to the building with that name. Optional keys: `use` (residential, commercial, retail, mixed use, industrial, civic, recreation) and `levels` (a whole number).
2. **Layer.** Otherwise the object belongs to a building named after its layer (the full layer path, so `Scheme A::Tower B` and `Scheme B::Tower B` stay apart). If the layer name contains a use word (for example "Residential" or "Retail"), that is the use. A layer with no use word, and no `use` user text, is unclassified.
3. **Nothing to go on.** A file with no layers beyond the default and no user text stays one building named after the file, which is today's behaviour.

Values the file does not give are left empty, not guessed: no use means "unclassified" (the existing grey), no `levels` means the popover shows no levels.

### Choices (21 Nov 2026)

Kelvin confirmed these on 21 Nov 2026:

1. **Unclassified stays grey.** A layer with no use word, and no `use` user text, shows as unclassified — the existing grey — not a guessed use.
2. **Short names under a scheme heading.** The import list shows the short building name under a scheme heading, for example Tower A under Scheme A, not the full layer path as the row title.
3. **A colour on the file recolours every building.** The whole-file colour is kept. Setting it overrides use colours on every building in that file. (This overrides a later suggestion to drop the file colour.)

### Choices (22 Nov 2026)

Kelvin confirmed these on 22 Nov 2026. They replace the 21 Nov pending decision that imported buildings would always be white in Drawing:

4. **Use or file colour in Drawing and 3D.** Imported buildings show their use colour, or the file colour when one is set, in both Drawing and 3D. A building with no use and no file colour shows as unclassified grey, as a filled footprint, in both views.
5. **Direct Sun Hours.** Visible imported buildings cast and receive in Direct Sun Hours, in 3D and in Drawing. Hidden (eye-off) buildings stay excluded.
6. **Exploded axo.** Visible imported buildings appear in the exploded axo, in their use or file colour (or unclassified grey). Hidden ones stay excluded.

### Choices (23 Nov 2026)

Kelvin asked for this on 23 Nov 2026 at 6:04 PM AEDT and confirmed it at 6:06 PM:

7. **No floating name labels.** Imported buildings do not show a floating name label next to the building in 3D or Drawing. Names stay in the import list and the building card. Wikidata landmark labels are unchanged.

## How we'll know it works

Tick these on the real desktop view, with a test `.3dm` that has three buildings on three layers, one with `building`, `use` and `levels` user text:

- [ ] The import panel lists three buildings under the file, as short names under a scheme heading (for example Tower A under Scheme A).
- [ ] A building whose layer has no use word, and no `use` user text, shows as unclassified (grey), as a filled footprint in Drawing.
- [ ] A colour set on the file recolours every building in that file, overriding use colours.
- [ ] Clicking each building in 3D shows its own name, use, height and (for the one with user text) levels, with "Source: your model".
- [ ] The plan shows three footprints, not one merged outline.
- [ ] Hiding one building hides it in 3D, Drawing, shadows, wind and exports; the other two stay.
- [ ] Drawing (plan, exploded axo, isometric) shows each imported building in its use colour, or the file colour when set.
- [ ] Visible imported buildings cast and receive in Direct Sun Hours, in 3D and in Drawing; a hidden one drops out.
- [ ] Visible imported buildings appear in the exploded axo; a hidden one drops out.
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
