# Changing CityCut’s fonts and colours

You do not need to write code. Fonts, font sizes, and the main colours of the app live in one file:

`src/theme.css`

The site plan uses a second file for its pens. Line weights, line colours, and dash patterns live in:

`src/drawing-style.css`

Every fill lives in a third file. The site plan, the figure-ground, the 3D view, the PNG download, the Illustrator files, and the Rhino layer colours all read it:

`src/colours.css`

Each line has a name, then a value. Change the value. Leave the name alone, including the two dashes at the start.

```css
--background: #EBEBEB;
```

The name is `--background`. The value is `#EBEBEB`.

## What each setting does

| Name | What you see on screen | Current value |
| --- | --- | --- |
| `--background` | The grey used by the page, the top bar, the area around the map, the 3D view, and the drawing. Change this one and all of those follow, unless you have given one of them its own colour. | `#EBEBEB` |
| `--page-bg` | The page behind the header and the map. | `var(--background)` |
| `--landing-bg` | The top bar on the landing page and on the model. | `var(--background)` |
| `--map-bg` | The colour behind the map while the streets are still loading. | `var(--background)` |
| `--model-bg` | The sky colour of the 3D model. | `var(--background)` |
| `--drawing-bg` | The on-screen site plan and figure-ground. | `var(--background)` |
| `--panel-bg` | Drawers, panels, and cards. | `#FFFCF8` |
| `--panel-border` | The line around panels, cards, inputs, and under the top bar. | `#C8C8C8` |
| `--text` | Main text, icons, and the Create model button. | `#1A1916` |
| `--muted-text` | Notes, credits, and other secondary text. | `#6E685E` |
| `--font-sans` | The font for buttons, labels, and ordinary text. | `"Outfit", "Avenir Next", "Segoe UI", sans-serif` |
| `--font-serif` | The font for the large “Your model is ready” title. | `"Fraunces", "Iowan Old Style", Georgia, serif` |
| `--font-size` | The size of ordinary text. | `15px` |
| `--font-size-brand` | The size of the CityCut name in the top bar. | `18px` |
| `--font-size-drawer` | The size of a drawer title, such as Exports. | `15px` |
| `--font-size-card` | The size of an export card title, such as Site plan. | `16px` |
| `--font-size-stat` | The size of the big numbers in the model summary. | `22px` |
| `--font-size-title` | The size of the large title in the model summary. | `28px` |
| `--wind-rose-size` | Diameter of the on-screen wind rose diagram in the 3D view; caption text scales from this. | `168px` |
| `--shape-toggle-on-bg` | Fill of the selected Square / Circle pill on the landing map. | `#1A1916` |
| `--shape-toggle-on-text` | Label on the selected Square / Circle pill. | `#FFFCF8` |

`var(--background)` means “use whatever `--background` is set to”. That is why one edit recolours the page, the header, the model, and the drawing together.

Downloaded Illustrator and PNG files do not use the colours in this file. Pens for the site plan, both on screen and in the site-plan Illustrator download, use `src/drawing-style.css`. Fills for the plan, the 3D view, and every download use `src/colours.css`. Both files are described below.

## How to edit it on GitHub

1. Open the CityCut repository on github.com.
2. Click through to the file `src/theme.css`. On github.com the path looks like the repository, then the `src` folder, then `theme.css`.
3. Click the pencil icon. It is near the top right of the file and is labelled “Edit this file”.
4. Change the value you want. For a colour, replace the six characters after `#`. For a size, replace the number before `px`. Do not delete the semicolon at the end of the line.
5. Scroll down to **Commit changes**. Leave the commit on the `main` branch.
6. Click **Commit changes**.
7. GitHub Pages rebuilds the site. That takes about 2 minutes.
8. Open the site and hard-refresh so the browser does not show the old copy. On a Mac that is Command Shift R. On Windows it is Ctrl F5.

## Colours

Write a colour as `#` plus six characters, like `#EBEBEB`. The characters are `0`–`9` and `A`–`F`. The first pair is red, the second is green, the third is blue. `#000000` is black. `#FFFFFF` is white. `#EBEBEB` is a light grey.

Use capital or lowercase letters. `#ebebeb` and `#EBEBEB` are the same colour.

## Fonts

The safest choices are fonts the app already loads, or a common font that is already on the computer:

- Outfit, for ordinary text. The app loads this.
- Fraunces, for the large title. The app loads this.
- Avenir Next, Segoe UI, Georgia, and the words `sans-serif` or `serif`. These are fallbacks. The browser uses the first one it can find.

Keep the quotes around a name that has a space, and keep the commas. A good ordinary-text line is:

```css
--font-sans: "Outfit", "Avenir Next", "Segoe UI", sans-serif;
```

A name the app does not load, such as a font from your computer only, will show for you and not for other people.

## How to undo a change

1. Open `src/theme.css` on github.com.
2. Click **History**. It is near the pencil icon.
3. Open the last good version of the file.
4. Click the pencil, copy that version’s values back if you need to, or use GitHub’s revert on that history entry if you are comfortable with it. The simple way is to edit the file again and put the old value back, then commit to `main` as above.
5. Wait about 2 minutes and hard-refresh the site.

## Fills

`src/colours.css` is the only place a fill is written down. The on-screen plan, the 3D view, the PNG, the Illustrator files, and the Rhino layer colours all read these names through one helper. A live edit in the Colours panel is stored as `citycut.colours` and covers the file until you reset it.

`--road-fill` and `--path-fill` keep the names they already had. The Line styles panel can still change them. Paste those two into `src/colours.css`, not into the pens file.

| Variable | Default | What it controls |
| --- | --- | --- |
| `--landing-map-mask` | `#F2F3F0` | Positron land background on the landing map; hides coloured water and green outside the cut frame (roads draw above). |
| `--landing-building-mask` | `#EAEAE5` | Positron building fill; hides use-coloured footprints outside the cut frame. |
| `--sheet-fill` | `#f4f1ea` | Illustrator site-plan page, and the casing under a rail so the line still reads on the road. |
| `--ground-fill` | `#e6e0d4` | Flat 3D ground, the ground on the 3D-view Illustrator sheet, and the Rhino Ground layer. |
| `--export-backdrop` | `#e7e4dc` | Backdrop of the 3D PNG, and the page behind the 3D-view Illustrator drawing. |
| `--figure-fill` | `#000000` | Figure-ground buildings, the black frame, north mark, and scale bar on that drawing, on screen and in the Illustrator file, and the Rhino FigureGround layer. |
| `--plan-empty` | `#6d675e` | The sentence shown when a plan has nothing in the frame. |
| `--contour-label` | `#6A6A6A` | Elevation numbers on the site plan, on screen and in the Illustrator file. |
| `--building-uniform` | `#FFFFFF` | Buildings when colour-by-use is off, that legend swatch, and the Rhino Buildings layer. |
| `--building-manual` | `#D4A017` | 3D viewport tint for buildings with a manual height override when “Show manual edits” is on. |
| `--site-building` | `#F2C230` | Buildings on the searched property: site plan, 3D, Rhino `Buildings::Site`, and Illustrator Site buildings layer. Manual-height amber and uniform colour apply to non-site buildings only; site buildings stay yellow unless manual-height tint is on for that building (manual wins in 3D). |
| `--site-building-edge` | `#3D3010` | Darker outline on site-building massing in the 3D viewport so they read against retail (`--use-retail`) and civic (`--use-civic`) yellows. |
| `--site-boundary` | `#D7263D` | Searched-property parcel boundary on the site plan, the 3D ground line, Rhino `Site::Boundary`, and Illustrator/PDF Site boundary layer. |
| `--use-residential` | `#E06C75` | Residential footprints, legend swatch, 3D massing, and the Residential Rhino layer. |
| `--use-commercial` | `#61AFEF` | Commercial footprints, legend swatch, 3D massing, and the Commercial Rhino layer. |
| `--use-retail` | `#E5C07B` | Retail footprints, legend swatch, 3D massing, and the Retail Rhino layer. |
| `--use-mixed` | `#C678DD` | Mixed-use footprints, legend swatch, 3D massing, and the MixedUse Rhino layer. |
| `--use-industrial` | `#D19A66` | Industrial footprints, legend swatch, 3D massing, and the Industrial Rhino layer. |
| `--use-civic` | `#98C379` | Civic footprints, legend swatch, 3D massing, and the Civic Rhino layer. |
| `--use-recreation` | `#56B6C2` | Recreation footprints, legend swatch, 3D massing, and the Recreation Rhino layer. |
| `--use-outbuilding` | `#5C6370` | Outbuilding footprints, legend swatch, 3D massing, and the Outbuilding Rhino layer. |
| `--use-unclassified` | `#B8B8B8` | Unclassified footprints, legend swatch, 3D massing, and the Unclassified Rhino layer. |
| `--source-osm` | `#1F4E79` | Buildings whose use came from an OpenStreetMap tag, and that legend swatch. |
| `--source-zone` | `#A9C4DE` | Buildings whose use was inferred from a planning zone, and that legend swatch. |
| `--source-none` | `#B8B8B8` | Buildings with no tag and no zone, and that legend swatch. |
| `--road-fill` | `#4A4A4A` | Unioned carriageway on the site plan and the figure-ground, on screen and in the Illustrator file. |
| `--path-fill` | `#D2B48C` | Unioned footpath on the site plan and the figure-ground, on screen and in the Illustrator file. |
| `--road-arterial` | `#3a3a3a` | Arterial ribbons in the 3D view and the 3D-view Illustrator file, and the Rhino Roads layer. |
| `--road-local` | `#4a4a4a` | Local-street ribbons in the 3D view and the 3D-view Illustrator file. |
| `--road-path` | `#5c5c5c` | Path ribbons in the 3D view and the 3D-view Illustrator file. |
| `--green-fill` | `#b7d39a` | Parks and other green on the site plan, on screen and in the Illustrator file. |
| `--green-3d` | `#7f9a62` | Green mesh in the 3D view, the 3D-view Illustrator green, and the Rhino Green layer. |
| `--water-fill` | `#9ec9d1` | Water on the site plan, on screen and in the Illustrator file. |
| `--water-3d` | `#8ebfc8` | Water mesh in the 3D view, the 3D-view Illustrator water, and the Rhino Water layer. |
| `--water-sunpath` | `#4A9FE8` | Water in the 3D viewport while the sun path diagram is on. |
| `--sun-study-surface` | `#FFFFFF` | Ground, roads, and parks in the 3D viewport while the sun path is on. |
| `--tree-fill` | `#6ea35a` | Tree-crown fill on the site plan, on screen and in the Illustrator file. |
| `--tree-crown` | `#5d8a45` | Tree-crown fill on the 3D-view Illustrator sheet. |
| `--tree-crown-edge` | `#2c4a28` | Outline around that 3D-view crown. |
| `--tree-trunk` | `#3e3428` | Trunk on the 3D-view Illustrator sheet. |
| `--tree-layer` | `#3e8a48` | Rhino Trees layer. The 3D crowns themselves are the shipped tree models. |
| `--rail-fill` | `#8d6244` | Rail ribbon in the 3D view and the Rhino Rail layer. The site-plan rail line stays a pen. |
| `--ground-edge` | `#2c2924` | Outline drawn around the flat ground slab in the 3D view. |
| `--hatch-paper` | `#ffffff` | Light band of the hatch on a zone-inferred building. |
| `--hatch-ink` | `#7d7d7d` | Dark band of the hatch on a zone-inferred building. |
| `--terrain-layer` | `#d6cebe` | Rhino Terrain layer. The mesh itself is shaded by elevation. |
| `--rhino-fallback` | `#b4b4b4` | Rhino layer used when a mesh has no colour of its own. |
| `--view-ink` | `#24221c` | Outlines and the title plate text on the 3D-view Illustrator sheet. |
| `--light-sky` | `#f7f4ee` | Sky side of the 3D hemisphere light. |
| `--light-ground` | `#c9c0b2` | Ground side of the 3D hemisphere light. |
| `--cut-line` | `#f7f4ee` | Frame drawn around the cut on the satellite preview. |
| `--sun-arc-summer` | `#1a1916` | Dec 21 sun path in the 3D heliodon, solid line (screen only). Black or grey only. |
| `--sun-arc-equinox` | `#1a1916` | Sep/Mar sun path in the 3D heliodon, dashed line (screen only). Black or grey only. |
| `--sun-arc-winter` | `#1a1916` | Jun 21 sun path in the 3D heliodon, dash-dot line (screen only). Black or grey only. |
| `--sun-marker` | `#ffcc1a` | Sun icon at the current time in the 3D heliodon (screen only). The only yellow in the heliodon. |
| `--sun-compass` | `#45423c` | Dark grey of the 3D heliodon dial: 10° altitude rings, azimuth radials, 1° ticks, degree numbers and hour lines (screen only). |
| `--sun-compass-label` | `#1a1916` | Ink of the 3D heliodon dial: horizon ring, 5° and 10° ticks, cardinal ticks, dashed axes, N/E/S/W, hour labels, arc labels and hour-dot outlines (screen only). |
| `--building-solar-neutral` | `#ffffff` | Single neutral building fill in the 3D viewport while the sun path and compass are on (screen only). |
| `--heliodon-dial-disc` | `#e8e2d8` | Faint ground disc under the heliodon dial at about 35% opacity (screen only). |
| `--shadow-fill` | `#454545` | Site-plan building shadows on the site plan. |
| `--axo-water` | `#7eb8da` | Exploded axo floodplain / water layer. |
| `--axo-road` | `#e8883a` | Exploded axo roads layer. |
| `--axo-green` | `#8fbc8f` | Exploded axo green spaces layer. |
| `--axo-building` | `#1a1916` | Exploded axo building footprints layer. |
| `--axo-guide` | `#c8c8c8` | Exploded axo vertical guides and plate outlines (solid edges). |
| `--axo-guide-dash` | `#c8c8c8` | Exploded axo vertical guide dashes (same colour as `--axo-guide`). |
| `--tram-line-stroke` | `#000000` | Tram routes on the site plan, exploded axo transport plate, and exports. |
| `--outline-building` | `#000000` | Thin outline on building fills on the site plan and in exports. |
| `--outline-tree` | `#000000` | Thin outline on tree crowns on the site plan and in exports. |
| `--outline-road` | `#000000` | Thin outline on road fills on the site plan and in exports. |
| `--outline-path` | `#000000` | Thin outline on footpath fills on the site plan and in exports. |
| `--outline-green` | `#000000` | Thin outline on green fills on the site plan and in exports. |
| `--outline-water` | `#000000` | Thin outline on water fills on the site plan and in exports. |
| `--outline-rail` | `#000000` | Thin outline on rail lines on the site plan and in exports. |
| `--outline-tram` | `#000000` | Thin outline on tram lines on the site plan and in exports. |
| `--outline-contour` | `#000000` | Thin outline on contour lines on the site plan and in exports. |
| `--axo-label` | `#6e685e` | Exploded axo layer labels. |
| `--axo-plan-flood` | `#5a9fd4` | Exploded axo planning flood overlay (LSIO/SBO/FO hatch base). |
| `--axo-plan-heritage` | `#c4a574` | Exploded axo heritage overlay (HO hatch base). |
| `--axo-plan-ddo` | `#9b7ede` | Exploded axo DDO overlay hatch base. |
| `--axo-plan-bmo` | `#d47a9b` | Exploded axo BMO overlay hatch base. |
| `--axo-hydro-area` | `#6eb5d9` | Exploded axo Vicmap hydro water area fill. |
| `--axo-hydro-course` | `#3d8fbf` | Exploded axo Vicmap hydro watercourse stroke. |
| `--axo-rail-line` | `#2d2d2d` | Exploded axo Vicmap rail centre line. |
| `--axo-rail-station` | `#1a1a1a` | Exploded axo Vicmap rail station marker. |
| `--axo-pt-train` | `#003366` | Exploded axo PTV train route. |
| `--axo-pt-tram` | `#00854a` | Exploded axo PTV tram route. |
| `--axo-pt-bus` | `#c45c00` | Exploded axo PTV bus route. |
| `--axo-contour` | `#8a8578` | Exploded axo Vicmap contour stroke. |
| `--wind-streak` | `#2B6CB0` | Animated wind streaks in the 3D viewport (~70% opacity). |
| `--wind-rose` | `#3d5a73` | On-screen wind rose overlay and Wind export layer. |

The contour lines in Rhino use the pen `--contour-stroke` from `src/drawing-style.css`, not a fill.

## Site plan lines

`src/drawing-style.css` is the only place the site plan’s pens are written down. The on-screen drawing and the site-plan Illustrator file both read it.

When you download a site plan or a figure-ground, the exporter calls `getComputedStyle` on the page’s `:root` at that moment. Whatever the variables currently resolve to — the file, or a live edit from the Line styles panel — is what goes into the file. A weight is millimetres on the printed sheet. It does not change when you zoom. Footpath width is different: it is metres on the ground, so the strip grows when you zoom in and when the drawing scale gets larger.

A dash is two lengths in millimetres: how long the mark is, then how long the gap is. `none` is a solid line. `1.5 0.75` is a dash of 1.5 mm with a 0.75 mm gap. `0 0.6` is a dotted line. A dot uses round caps, so the zero-length mark is drawn as a dot.

| Name | What it controls | Default | Units |
| --- | --- | --- | --- |
| `--building-stroke-mm` | Weight of the building outline. `0` leaves the fill with no edge | `0` | mm |
| `--building-stroke` | Colour of the building outline | `#1C1B17` | colour |
| `--building-dash` | Dash of the building outline | `none` | mm, on then off |
| `--road-fill` | Fill of the unioned carriageway. Defined in `src/colours.css` | `#4A4A4A` | colour |
| `--road-kerb` | Whether the kerb outline is drawn. `on` or `off` | `on` | on or off |
| `--road-kerb-mm` | Weight of the kerb, on the outer edge of the road fill | `0.22` | mm |
| `--road-kerb-stroke` | Colour of the kerb. Mid grey, so it shows on the road fill and on the page | `#8D8983` | colour |
| `--road-kerb-dash` | Dash of the kerb | `none` | mm, on then off |
| `--path-width-m` | Width of a footpath strip, centred on the way. `1.2` is 0.6 m each side | `1.2` | m on the ground |
| `--path-fill` | Fill of the unioned footpath. Defined in `src/colours.css`. Light tan on the page | `#D2B48C` | colour |
| `--path-edge` | Whether the footpath outline is drawn. `on` or `off` | `off` | on or off |
| `--path-edge-mm` | Weight of that outline, on the unioned edge only. `0` leaves the fill | `0` | mm |
| `--path-edge-stroke` | Colour of the footpath outline | `#5C5C5C` | colour |
| `--path-edge-dash` | Dash of the footpath outline | `none` | mm, on then off |
| `--rail-stroke-mm` | Weight of a rail line | `0.15` | mm |
| `--rail-stroke` | Colour of a rail line | `#8D6244` | colour |
| `--rail-dash` | Dash of a rail line | `none` | mm, on then off |
| `--green-stroke-mm` | Weight of the edge around green. `0` leaves the fill with no edge | `0` | mm |
| `--green-stroke` | Colour of the green edge | `#5E8A45` | colour |
| `--green-dash` | Dash of the green edge | `none` | mm, on then off |
| `--water-stroke-mm` | Weight of the edge around water. `0` leaves the fill with no edge | `0` | mm |
| `--water-stroke` | Colour of the water edge | `#3E7C86` | colour |
| `--water-dash` | Dash of the water edge | `none` | mm, on then off |
| `--contour-stroke-mm` | Weight of a contour | `0.1` | mm |
| `--contour-stroke` | Colour of a contour | `#B0B0B0` | colour |
| `--contour-dash` | Dash of a contour | `1.5 0.75` | mm, on then off |
| `--contour-index-mm` | Weight of every Nth contour. Same colour and dash as the other contours | `0.18` | mm |
| `--contour-index-every` | How many drawn contours between index lines. `5` is every 5th line: 5 m on 1 m data, 25 m once that data is drawn at 5 m, and 50 m on 10 m data | `5` | count |
| `--contour-coarse-interval-m` | Interval used for metro contours at small plan scales. Only altitudes on this step are drawn | `5` | m |
| `--contour-coarse-from-scale` | Plan-scale denominator where that coarser interval starts. `2500` is 1:2500, 1:5000, and smaller. 1:500 and 1:1000 keep every metre | `2500` | scale denominator |
| `--frame-stroke-mm` | Weight of the square frame | `0.35` | mm |
| `--frame-stroke` | Colour of the frame | `#1C1B17` | colour |
| `--frame-dash` | Dash of the frame | `none` | mm, on then off |
| `--annotation-stroke-mm` | Weight of the scale bar and north arrow | `0.13` | mm |
| `--annotation-stroke` | Colour of the scale bar, north arrow, title, and the on-screen N | `#1C1B17` | colour |
| `--annotation-dash` | Dash of the annotation strokes | `none` | mm, on then off |
| `--site-boundary-mm` | Weight of the searched-property parcel boundary | `0.35` | mm |
| `--site-boundary-stroke` | Alias of `--site-boundary` for the pen cascade | `var(--site-boundary)` | colour |
| `--site-boundary-dash` | Dash of the site boundary (long dash, gap, dot, gap) | `2.4 0.6 0.2 0.6` | mm per segment |
| `--site-building-stroke-mm` | Outline on site-building fills on the site plan | `0.35` | mm |
| `--site-building-stroke` | Colour of that site-building outline on the plan and in exports | `#3D3010` | colour |
| `--site-building-dash` | Dash of the site-building outline | `none` | mm, on then off |
| `--tree-stroke-mm` | Weight of a tree-crown outline | `0.08` | mm |
| `--tree-stroke` | Colour of a tree-crown outline. Uses `--outline-tree` from `src/colours.css` | `var(--outline-tree)` | colour |
| `--tree-dash` | Dash of a tree-crown outline | `none` | mm, on then off |
| `--tree-fill-opacity` | Opacity of tree-crown fill on the site plan and in exports | `0.7` | 0–1 |
| `--tram-stroke-mm` | Weight of a tram route line | `0.12` | mm |
| `--tram-stroke` | Colour of a tram route. Uses `--tram-line-stroke` from `src/colours.css` | `var(--tram-line-stroke)` | colour |
| `--tram-dash` | Dash of a tram route | `1.2 0.6` | mm, on then off |
| `--axo-guide-dash` | Dash of exploded axo vertical guides | `0.8 0.5` | mm, on then off |
| `--building-edge` | Colour of the massing edge in the 3D view | `#000000` | colour |

Green fills, water fills, tree fills, and the other fills are in the Fills table above. This list is the pens. The footpath fill stays named here because the Line styles panel still edits it, and the value itself is in `src/colours.css`.

The ways in the footpath strip are the ones the path layer already took from OpenStreetMap: `highway=footway` (including `footway=sidewalk` and `footway=crossing`), `path`, `cycleway`, `steps`, `pedestrian`, `bridleway`, and `track`. They are buffered in metres, unioned into one shape, and drawn under the road fill. Buildings stay on top. Figure-ground uses the same strip and the same `#DADADA` fill, which reads as a light grey on the white sheet.

`--path-stroke-mm`, `--path-stroke`, and `--path-dash` were the old centreline. They are now the footpath edge. A saved edit that still uses those names is read as `--path-edge-mm`, `--path-edge-stroke`, and `--path-edge-dash`.

## Try a change, then paste it into the file

You can try a pen on the site before you edit the file.

1. Open a model and switch to the Drawing view. Open the Drawing drawer.
2. Open **Line styles**. It starts collapsed so it does not fill the drawer. On a phone it is in the same bottom sheet, and the sheet scrolls.
3. Change a weight, a colour, or a dash. The site plan updates straight away. The choices are Solid, Dashed 1.5 0.75, Fine dash 0.75 0.4, Dotted, and Custom. Road fill and footpath fill have their own colours. Kerb outline and Footpath edge turn those outlines on or off. Footpath width is metres on the ground, in steps of 0.1.
4. The browser remembers the edits (`citycut.lineStyles`). A site-plan download after an edit uses the edited pens.
5. Click **Copy CSS**. It copies only the variables you changed, ready to paste. A short note confirms the copy.
6. Open `src/drawing-style.css` on github.com, click the pencil, and paste those lines over the matching ones. If the copy also names `src/colours.css`, paste that block into the fills file instead. Do not delete the semicolon.
7. Commit to `main`, wait about 2 minutes, and hard-refresh. Then click **Reset to defaults** in Line styles so the browser is not still covering the file with the old edit.

**Reset to defaults** clears the remembered edits and shows the file again.

The same drawer has **Colours**, under Line styles. It lists every fill, with a swatch and a picker, in the same groups as `src/colours.css`.

1. Open **Colours**. It starts collapsed.
2. Change a swatch. The plan, the 3D view, and the next download use the new fill straight away.
3. The browser remembers the edits (`citycut.colours`).
4. Click **Copy CSS**. It copies only the fills you changed, ready to paste into `src/colours.css`.
5. Paste those lines over the matching ones, commit, and hard-refresh. Then click **Reset to defaults** so the browser is not still covering the file.
