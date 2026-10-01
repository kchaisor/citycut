# Changing CityCut’s fonts and colours

You do not need to write code. Fonts, font sizes, and the main colours of the app live in one file:

`src/theme.css`

The site plan uses a second file for its pens. Line weights, line colours, dash patterns, and the road fill live in:

`src/drawing-style.css`

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

`var(--background)` means “use whatever `--background` is set to”. That is why one edit recolours the page, the header, the model, and the drawing together.

Downloaded Illustrator and PNG files do not use the colours in this file. The site plan, both on screen and in the site-plan Illustrator download, uses `src/drawing-style.css` instead. That file is described below.

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

## Site plan lines

`src/drawing-style.css` is the only place the site plan’s pens are written down. The on-screen drawing and the site-plan Illustrator file both read it.

When you download a site plan or a figure-ground, the exporter calls `getComputedStyle` on the page’s `:root` at that moment. Whatever the variables currently resolve to — the file, or a live edit from the Line styles panel — is what goes into the file. A weight is millimetres on the printed sheet. It does not change when you zoom. Footpath width is different: it is metres on the ground, so the strip grows when you zoom in and when the drawing scale gets larger.

A dash is two lengths in millimetres: how long the mark is, then how long the gap is. `none` is a solid line. `1.5 0.75` is a dash of 1.5 mm with a 0.75 mm gap. `0 0.6` is a dotted line. A dot uses round caps, so the zero-length mark is drawn as a dot.

| Name | What it controls | Default | Units |
| --- | --- | --- | --- |
| `--building-stroke-mm` | Weight of the building outline. `0` leaves the fill with no edge | `0` | mm |
| `--building-stroke` | Colour of the building outline | `#1C1B17` | colour |
| `--building-dash` | Dash of the building outline | `none` | mm, on then off |
| `--road-fill` | Fill of the unioned carriageway | `#4A4A4A` | colour |
| `--road-kerb` | Whether the kerb outline is drawn. `on` or `off` | `on` | on or off |
| `--road-kerb-mm` | Weight of the kerb, on the outer edge of the road fill | `0.22` | mm |
| `--road-kerb-stroke` | Colour of the kerb. Mid grey, so it shows on the road fill and on the page | `#8D8983` | colour |
| `--road-kerb-dash` | Dash of the kerb | `none` | mm, on then off |
| `--path-width-m` | Width of a footpath strip, centred on the way. `1.2` is 0.6 m each side | `1.2` | m on the ground |
| `--path-fill` | Fill of the unioned footpath. Slightly darker than the page, lighter than the road | `#DADADA` | colour |
| `--path-edge` | Whether the footpath outline is drawn. `on` or `off` | `off` | on or off |
| `--path-edge-mm` | Weight of that outline, on the unioned edge only. `0` leaves the fill | `0.15` | mm |
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
| `--contour-index-every` | How many intervals between index contours. `5` is 5 m on 1 m data and 50 m on 10 m data | `5` | count |
| `--frame-stroke-mm` | Weight of the square frame | `0.35` | mm |
| `--frame-stroke` | Colour of the frame | `#1C1B17` | colour |
| `--frame-dash` | Dash of the frame | `none` | mm, on then off |
| `--annotation-stroke-mm` | Weight of the scale bar and north arrow | `0.13` | mm |
| `--annotation-stroke` | Colour of the scale bar, north arrow, title, and the on-screen N | `#1C1B17` | colour |
| `--annotation-dash` | Dash of the annotation strokes | `none` | mm, on then off |
| `--tree-stroke-mm` | Weight of a tree-crown outline | `0.15` | mm |
| `--tree-stroke` | Colour of a tree-crown outline | `#245232` | colour |
| `--tree-dash` | Dash of a tree-crown outline | `none` | mm, on then off |

Green fills, water fills, and tree fills are not in this list. Only their edges are. The footpath fill is in the list because the strip is the line.

The ways in the footpath strip are the ones the path layer already took from OpenStreetMap: `highway=footway` (including `footway=sidewalk` and `footway=crossing`), `path`, `cycleway`, `steps`, `pedestrian`, `bridleway`, and `track`. They are buffered in metres, unioned into one shape, and drawn under the road fill. Buildings stay on top. Figure-ground uses the same strip and the same `#DADADA` fill, which reads as a light grey on the white sheet.

`--path-stroke-mm`, `--path-stroke`, and `--path-dash` were the old centreline. They are now the footpath edge. A saved edit that still uses those names is read as `--path-edge-mm`, `--path-edge-stroke`, and `--path-edge-dash`.

## Try a change, then paste it into the file

You can try a pen on the site before you edit the file.

1. Open a model and switch to the Drawing view. Open the Drawing drawer.
2. Open **Line styles**. It starts collapsed so it does not fill the drawer. On a phone it is in the same bottom sheet, and the sheet scrolls.
3. Change a weight, a colour, or a dash. The site plan updates straight away. The choices are Solid, Dashed 1.5 0.75, Fine dash 0.75 0.4, Dotted, and Custom. Road fill and footpath fill have their own colours. Kerb outline and Footpath edge turn those outlines on or off. Footpath width is metres on the ground, in steps of 0.1.
4. The browser remembers the edits (`citycut.lineStyles`). A site-plan download after an edit uses the edited pens.
5. Click **Copy CSS**. It copies only the variables you changed, ready to paste. A short note confirms the copy.
6. Open `src/drawing-style.css` on github.com, click the pencil, and paste those lines over the matching ones. Do not delete the semicolon.
7. Commit to `main`, wait about 2 minutes, and hard-refresh. Then click **Reset to defaults** in Line styles so the browser is not still covering the file with the old edit.

**Reset to defaults** clears the remembered edits and shows the file again.
