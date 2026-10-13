# DIY tweaks cheat sheet

Tiny visual edits for Kelvin (architect, not a developer). Edit on GitHub’s web editor — no local coding run. Line numbers below match commit `c97d02f` on `main` (Oct 2026, after #101–#110). Prefer the **SHA permalink** (stable). The **main** form also works but may drift after later commits.

**Permalink forms**

- SHA: `https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/<path>#L<n>`
- Branch: `https://github.com/kchaisor/citycut/blob/main/<path>#L<n>`

If a line number has drifted, search the file (GitHub: press `t`, open file, then ⌘F / Ctrl+F) for the **token name** in the Value column — names are stable, line numbers are not.

---

## How to edit on GitHub

1. Open a SHA (or main) permalink below.
2. Click the **pencil** (“Edit this file”).
3. Change only the **value** (colour after `#`, number before `px`/`mm`, or the quoted label). Keep the name, quotes, and trailing `;`.
4. **Commit changes** → commit **directly to `main`**.
5. GitHub Pages rebuilds in about **2–3 minutes**. Check **Actions** → workflow **pages** (or Deploy) for a green tick.
6. Hard-refresh the live site (Mac: ⌘⇧R · Windows: Ctrl+F5).
7. **Undo:** file → **History** → open the bad commit → **Revert**, or Actions history; tip below.

**Tip:** If a change breaks the site, **revert that commit** on `main`. Do not try to “fix forward” unless you know the file well.

---

## Which file is the source?

| File | What it owns | Edit together? |
| --- | --- | --- |
| [`src/theme.css`](https://github.com/kchaisor/citycut/blob/main/src/theme.css) | Fonts, font sizes, base UI chrome, **`--accent`**, sidebar rail/panel widths | Base values. `THEME.md` is a human guide — optional to update. |
| [`src/floating.css`](https://github.com/kchaisor/citycut/blob/main/src/floating.css) | The **floating UI** look (v3): background gradients, map tint, MGA cross colour/size, 3D floor-grid colour, pure-black UI text, logo/brand scale | **Loaded last — it overrides `theme.css` and `index.css`.** If a `theme.css` edit seems to do nothing, the same token is probably re-set here. |
| [`src/colours.css`](https://github.com/kchaisor/citycut/blob/main/src/colours.css) | Every **fill** (plan, 3D, PNG, Illustrator, Rhino layers) | **Source.** [`src/lib/colours.ts`](https://github.com/kchaisor/citycut/blob/main/src/lib/colours.ts) *reads* this file — do **not** hand-edit hexes there. |
| [`src/drawing-style.css`](https://github.com/kchaisor/citycut/blob/main/src/drawing-style.css) | Line weights (mm), dashes, frame / site-boundary pens | Source for pens. |
| [`THEME.md`](https://github.com/kchaisor/citycut/blob/main/THEME.md) | Longer explanation of the same tokens | Docs only; CSS wins if they disagree. |

`--accent` (`#FFF500` in theme), `--site-building` and `--imported-massing` (both `#FFF500` in colours) are **separate**. Changing one does **not** change the others.

---

## Colours (accent + key fills)

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Accent fill (selected rail item, primary pills) | `src/theme.css` · L75 | `--accent: #FFF500` | [L75](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/theme.css#L75) |
| Accent ink / edge / hover | `src/theme.css` · L78–L84 | `#1A1916` / `#1A1916` / `#FFF9A6` | [L78](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/theme.css#L78) |
| Page grey (base, under the gradient) | `src/theme.css` · L10 | `--background: #EBEBEB` | [L10](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/theme.css#L10) |
| Site building (yellow massing) | `src/colours.css` · L42 | `--site-building: #FFF500` | [L42](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/colours.css#L42) |
| Imported massing (Import tab, dashed outline) | `src/colours.css` · L44 | `--imported-massing: #FFF500` | [L44](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/colours.css#L44) |
| Site boundary colour | `src/colours.css` · L50 | `--site-boundary: #D7263D` | [L50](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/colours.css#L50) |

Docs table for accent: `THEME.md` L48. Main-branch example: [`…/blob/main/src/theme.css#L75`](https://github.com/kchaisor/citycut/blob/main/src/theme.css#L75).

---

## Background gradients (floating UI)

Each gradient runs top → bottom. Edit the two hexes of a pair.

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Landing / app background | `src/floating.css` · L6–L7 | `--float-grad-top: #F3F3F4` / `--float-grad-bottom: #CFD1D5` | [L6](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L6) |
| 3D model sky (behind the model) | `src/floating.css` · L25–L26 | `--model-grad-top: #F2F2F3` / `--model-grad-bottom: #B9BDC4` | [L25](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L25) |
| Landing map tint (multiplied over greyscale streets) | `src/floating.css` · L27–L28 | `--map-tint-top: #FFFFFF` / `--map-tint-bottom: #C3C8D0` | [L27](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L27) |
| Phone sidebar background | `src/floating.css` · L89 | reuses `--float-grad-top` / `--float-grad-bottom` | [L89](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L89) |

The sidebar itself has **no fill** on desktop: `--sidebar-bg: transparent` ([L20](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L20)) overrides `--sidebar-bg: #EBEBEB` in `theme.css` L87.

---

## Text colour

UI text is **pure black** via a block in `floating.css` that overrides `theme.css`:

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Sidebar / landing text, labels, icons | `src/floating.css` · L177–L185 | `--text`, `--muted-text`, `--float-ink`, `--float-label`, `--float-label-on-map`, `--sidebar-icon` all `#000000` | [L177](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L177) |
| Base text (only where the block above doesn’t apply) | `src/theme.css` · L34 | `--text: #1A1916`; `--muted-text: #6E685E` at L37 | [L34](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/theme.css#L34) |

To soften the UI text, change the `#000000` values in the `floating.css` block (keep them dark enough to read over the map).

---

## Logo & brand size

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Brand name base size | `src/theme.css` · L49 | `--font-size-brand: 18px` | [L49](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/theme.css#L49) |
| Brand name multiplier | `src/floating.css` · L193 | `calc(var(--font-size-brand) * 1.22)` | [L193](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L193) |
| Logo mark scale | `src/floating.css` · L194 | `transform: scale(1.22)` | [L194](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L194) |
| Logo mark base box | `src/index.css` · L37 | `.mark` `18px` × `18px` | [L37](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L37) |

Keep the two `1.22` values equal so the mark and the name grow together.

---

## Landing map crosses (MGA grid)

Small `+` marks on the landing map at round MGA (GDA2020) coordinates.

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Cross colour | `src/floating.css` · L16 | `--grid-cross: #1A1916` | [L16](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L16) |
| Cross size (half-width; 6 → 12 px cross) | `src/floating.css` · L18 | `--grid-cross-arm: 6px` | [L18](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L18) |
| Spacing levels (m) | `src/lib/mgaGrid.ts` · L4 | `MGA_GRID_STEPS_M = [10, 50, 100, 500, 1000, 5000, 10000, 50000]` | [L4](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/lib/mgaGrid.ts#L4) |
| Screen gap at which a level is fully dark | `src/lib/mgaGrid.ts` · L6 | `MGA_GRID_MIN_GAP_PX = 72` | [L6](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/lib/mgaGrid.ts#L6) |
| Screen gap at which a finer level starts fading in | `src/lib/mgaGridLayer.ts` · L13 | `MGA_GRID_FADE_START_PX = 28` | [L13](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/lib/mgaGridLayer.ts#L13) |

Levels cross-fade as you zoom: a finer level fades in between the two gaps above while coarser levels stay dark, so there is always a set of crosses on screen. The two CSS tokens (`--grid-cross`, `--grid-cross-arm`) are the safe knobs. Changing the spacing numbers or gaps is borderline-code — keep the steps ascending and the fade start below 72.

---

## 3D floor grid

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Grid line colour | `src/floating.css` · L29 | `--model-grid-line: #FFFFFF` | [L29](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L29) |
| Grid spacing (m, scales up for big cuts) | `src/components/SceneBackdrop.tsx` · L46 | `GRID_STEP_M = 50` | [L46](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/components/SceneBackdrop.tsx#L46) |
| How far it reaches (cut widths) | `src/components/SceneBackdrop.tsx` · L47 | `GRID_REACH = 4` | [L47](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/components/SceneBackdrop.tsx#L47) |

Screen-only: never in PNG, `.3dm` or `.ai` exports.

---

## Font sizes

| Token | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Body | `src/theme.css` · L46 | `--font-size: 15px` | [L46](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/theme.css#L46) |
| Brand (CityCut) | `src/theme.css` · L49 | `18px` (× 1.22 in floating.css, see Logo) | [L49](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/theme.css#L49) |
| Drawer / card / stat / title | `src/theme.css` · L52–L61 | `15` / `16` / `22` / `28px` | [L52](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/theme.css#L52) |
| Sidebar body type | `src/index.css` · L1174 | `font-size: 13px` | [L1174](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L1174) |
| Small section labels | `src/floating.css` · L105 | `font-size: 11px` | [L105](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L105) |

---

## Sidebar width (`--sidebar-w` / `--sidebar-h`)

| What | File · line | Notes | SHA link |
| --- | --- | --- | --- |
| Rail width | `src/theme.css` · L117 | `--sidebar-rail-w: 56px` | [L117](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/theme.css#L117) |
| Panel width | `src/theme.css` · L118 | `--sidebar-panel-w: 320px` | [L118](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/theme.css#L118) |
| `--sidebar-w` (desktop) | `src/index.css` · L1154 | `calc(rail + panel)` | [L1154](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L1154) |
| `--sidebar-h` (phone, model) | `src/index.css` · L1618 | `calc(56px + 52px + min(42vh, 360px))` | [L1618](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L1618) |
| `--sidebar-h` (phone, landing) | `src/index.css` · L1656 | same formula | [L1656](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L1656) |

Prefer editing **rail/panel** in `theme.css`; `--sidebar-w` / `--sidebar-h` are derived in `index.css`.

---

## Key spacing & padding

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Sidebar head pad | `src/index.css` · L1285 | `20px 24px 0` | [L1285](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L1285) |
| Sidebar body pad | `src/index.css` · L1302 | `0 24px 16px` | [L1302](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L1302) |
| Sidebar foot pad | `src/index.css` · L1311 | `16px 24px` | [L1311](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L1311) |
| Group pad | `src/index.css` · L1354 | `20px 0` | [L1354](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L1354) |
| Rail pad / gap | `src/index.css` · L1244–L1245 | `12px 0` / `4px` | [L1244](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L1244) |

---

## Outline & dashed-frame line weights

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Cut / plan **frame** weight | `src/drawing-style.css` · L73 | `--frame-stroke-mm: 0.35` | [L73](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/drawing-style.css#L73) |
| Frame dash | `src/drawing-style.css` · L75 | `--frame-dash: none` | [L75](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/drawing-style.css#L75) |
| **Site boundary** weight | `src/drawing-style.css` · L98 | `--site-boundary-mm: 0.35` | [L98](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/drawing-style.css#L98) |
| Site boundary dash-dot | `src/drawing-style.css` · L100 | `2.4 0.6 0.2 0.6` (mm) | [L100](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/drawing-style.css#L100) |

---

## Border radius (key UI)

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Rail icon button (what you see) | `src/floating.css` · L94 | `border-radius: 999px` (pill; overrides `8px` at index.css L1256) | [L94](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L94) |
| Sidebar primary (Create/Export) base | `src/index.css` · L1323 | `6px` | [L1323](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L1323) |
| Generic `.primary` | `src/index.css` · L419 | `8px` | [L419](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L419) |

---

## Opacity (key)

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Tree fill on plan | `src/drawing-style.css` · L87 | `--tree-fill-opacity: 0.7` | [L87](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/drawing-style.css#L87) |
| Disabled primary | `src/index.css` · L424 | `0.45` | [L424](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L424) |
| Sidebar primary hover | `src/index.css` · L1328 | `0.92` | [L1328](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L1328) |
| Height-bar LiDAR hatch | `src/index.css` · L1421 | `0.55` | [L1421](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/index.css#L1421) |
| Rail / brand hover wash | `src/floating.css` · L22 | `--sidebar-hover: #FFFFFF99` (last 2 digits = alpha) | [L22](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/floating.css#L22) |

---

## User-facing labels

| Label | File · line | SHA link |
| --- | --- | --- |
| Model sections: Model details, Buildings, Trees, Drawing, Sun, Wind, Import, Export | `src/lib/sidebarSections.ts` · L14–L23 | [L14](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/lib/sidebarSections.ts#L14) |
| Landing rail: Place, Cut, Layers | `src/components/SelectChrome.tsx` · L29–L40 | [L29](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/components/SelectChrome.tsx#L29) |
| Layer row names | `src/components/SelectChrome.tsx` · L20–L26 | [L20](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/components/SelectChrome.tsx#L20) |
| **Create model** (and “Reading the map…”) | `src/components/SelectChrome.tsx` · L174 | [L174](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/components/SelectChrome.tsx#L174) |
| **Export model** | `src/components/ModelPage.tsx` · L1341 | [L1341](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/components/ModelPage.tsx#L1341) |

Change only the quoted string. Leave `id` / `key` values alone.

---

## Credit text

| Credit | File · line | SHA link |
| --- | --- | --- |
| Base attribution | `src/lib/dataCredits.ts` · L3–L4 | [L4](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/lib/dataCredits.ts#L4) |
| Byline | `src/lib/dataCredits.ts` · L14 | [L14](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/lib/dataCredits.ts#L14) |
| Model stage credit line (assembled) | `src/lib/dataCredits.ts` · L30 (`modelStageCreditHtml`) | [L30](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/lib/dataCredits.ts#L30) |
| CoM trees plain / HTML | `src/lib/comTreesCredit.ts` · L13–L14, L27–L29 | [L14](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/lib/comTreesCredit.ts#L14) |
| CoM building heights | `src/lib/comBuildingHeightCredit.ts` · L14–L15 | [L15](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/lib/comBuildingHeightCredit.ts#L15) |
| Model page credit call (code — don’t edit) | `src/components/ModelPage.tsx` · L2094 | [L2094](https://github.com/kchaisor/citycut/blob/c97d02f8468c5bf8ee5dd82fca83c8c950c95340/src/components/ModelPage.tsx#L2094) |

**Keep licence names, © holders, and dataset titles accurate.** Cosmetic wording only; do not drop required attribution.

---

## NOT safe to DIY

- **`.ts` / `.tsx` logic** beyond a literal string or a simple number in a label/credit constant (conditionals, imports, JSX structure).
- **Export code** (`.ai` / `.3dm` / PDF builders under `src/lib/*Export*`, `aiPlan`, Rhino helpers) and the **Import** code (`src/lib/massingImport.ts`, `massingRuntime`).
- **Workflows** under `.github/`.
- **`pipeline/`** and data build scripts.
- **Data URLs and credit licence terms** — must stay legally accurate; tests assert exact credit strings (`dataCredits.test.ts`, `comTreesCredit.test.ts`, `comBuildingHeightCredit.test.ts`, `creditLinks.test.ts`).
- **Colours asserted in tests** — changing these hexes can fail CI until tests are updated:
  - `--site-building` `#FFF500` — `src/lib/siteExport.test.ts` L13
  - `--site-boundary` `#D7263D` — `siteExport.test.ts` L17–L18; dash pattern in `siteBoundaryDash.test.ts`
  - `--background` / `--model-bg` `#EBEBEB` — `drawingSheet.test.ts` L6
  - `--building-solar-neutral` `#FFFFFF` — `sunStudyViewport.test.ts` L7
- **No new colour literals in code** — a test allowlists colours; add a key in `colours.css` instead.
- **Camera and viewport** code (`MapStage`, camera memory, `qaCameraBridge`, framing helpers, `MgaGridLayer`).
- **`vite.config` and `base: "/citycut/"`** — breaks Pages paths if wrong.

When in doubt: ask, or revert.
