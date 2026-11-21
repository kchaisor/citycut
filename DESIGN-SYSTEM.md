# CityCut design system

Version 1, 17 Nov 2026. Built from `main` @ `e9e4b35` and the live site at 1440×900 and 1280×800. Desktop only.
Source token files: `src/theme.css` (chrome), `src/colours.css` (fills), `src/drawing-style.css` (site-plan lines), `src/floating.css` `:root` blocks (Studio HUD). Proposed consolidated block: `tokens-proposed.css`.

## 1. The rule

1. **Tokens only.** In CSS and TSX, every colour, font size, weight, radius, shadow, duration, z-index and spacing value comes from a `var(--…)` in a token file. No raw `px`/hex/`rgb(` outside `:root`. The only exceptions are `0`, `1px` hairlines, `100%`, and geometry computed in code (map/3D/SVG plan).
2. **No new tokens without a row here.** If you need a value that isn't in this file, add it to the token file, add the row here and in THEME.md in the same PR.
3. **Check, then declare.** Before asking to merge UI work, check the screenshots against §3–§8. List every deviation in the PR body under `Design-system deviations:` (value, where, why). Write "none" if there are none.
4. **Hard checks** (MUST): text ≥ 4.5:1, UI parts and focus rings ≥ 3:1, a visible `:focus-visible` on every control, no HUD overlap at 1440×900 and 1280×800, and a `prefers-reduced-motion` path for every transition.

## 2. Fonts

| Family | Use | Weights loaded |
|---|---|---|
| **Geist** (`--sans`) | All UI text: labels, buttons, headings, body | 400, 500, 600, 700 |
| **Geist Mono** (`--mono`) | Anything you'd read as data: numbers, counts, coordinates, CRS/EPSG tags, dimensions (`500 × 500 m`), times, angles, percentages | **500, 600 only.** 400 and 700 aren't loaded, so the browser substitutes them. |
| Outfit 700 (`--display`) | The **CityCut wordmark** and the **Create model** CTA only (brand moments) | 700 |

Why this pairing: Geist and Geist Mono share one skeleton, so the mono reads as the same voice in "data mode". Mono figures line up in columns and look measured, which suits an architect's tool. With mono you can tell a value from its label without adding colour. Always set `font-variant-numeric: tabular-nums` on mono numbers. No other families: the SVG compass and plan labels currently ask for Inter (see the cleanup list).

## 3. Type scale

The base is **13px**. Below the base, steps go down 1px at a time (12/11/10). This is a dense pro-tool UI where 11–13px carries about 55% of all text, and a 1.2 ratio would jump from 10 to 12 to 14, losing the steps the UI actually uses. Above the base, the ratio is **1.25** (13 → 16 → 20 → 24). There are seven steps. **Nothing goes below 10px.**

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `--fs-micro` | 10 / 12px, UPPERCASE, +0.08em | 700 | Section headers (SITE INTELLIGENCE, VIEW STYLE), KPI labels, rail-button labels, the RECENT label |
| `--fs-caption` | 11 / 16px | 500 text, 600 controls | Chips, segmented options, small buttons, counts, coordinate pill, CRS tag, legend text |
| `--fs-sm` | 12 / 16px | 500 rows, 600 buttons | Mode buttons, export buttons, list rows, breadcrumb, tooltips, panel body |
| `--fs-body` | 13 / 20px (1.54) | 400 body, 500 input | Search input, source names, paragraphs, KPI values (mono 600) |
| `--fs-title` | 16 / 20px (1.25) | 600 (wordmark: Outfit 700) | Panel H2 (Model details), wordmark, Create model CTA |
| `--fs-stat` | 20 / 24px (1.2) | 700 mono 600 | Big numbers in summaries |
| `--fs-display` | 24 / 28px (1.17) | 700 | The one "Your model is ready" title |

Weights: **400 / 500 / 600 / 700** only (560 → 500, 650 → 600, 800 → 700). Letter-spacing: `+0.08em` on micro caps, `-0.02em` on ≥16px, and 0 everywhere else.

## 4. Colours

Fills, map/plan/3D colours and line weights are defined **only** in `src/colours.css` and `src/drawing-style.css` (see THEME.md). Don't copy them here or into components. UI chrome is below. The contrast numbers are computed (WCAG 2.x) on the composited HUD card `#FCFBF9`, which is `--bg-card` over white. Over the darkest 3D road it composites to `#F2F1EF`, and every pass below still holds there.

| Token | Hex | Role | vs card | vs `--bg-sub` | Verdict |
|---|---|---|---|---|---|
| `--bg-card` | `rgb(252 251 249 / 94%)` + blur 18 | Every HUD island and panel. Uniform: no second background, no inner borders | – | – | – |
| `--bg-elev` | `#FFFFFF` | Selected sub-option, popovers, search results | – | – | – |
| `--bg-sub` | `#F2F1EC` | Tracks, KPI cells, tonal buttons, chips, row hover | 1.09 | – | Fill only |
| `--ink` | `#141413` | Primary text, icons, accent edges, inverse fills | 17.82 | 16.30 | ✅ |
| `--ink-2` | `#4A4945` | Secondary text, inactive mode buttons | 8.71 | 7.97 | ✅ |
| `--ink-3` | **`#6B6963`** (was `#787670`) | Muted text: section headers, meta, counts, inactive segments | 5.31 (was 4.39 ❌) | 4.85 (was 4.02 ❌) | ✅ after fix |
| `--on-ink` | `#FFFFFF` | Text on an `--ink` fill (2× PNG, Solar Study, tooltip) | 18.43 on ink | | ✅ |
| `--accent` | `#FFF500` | **Fill only**: current mode or tool, primary CTA, active tick, Ready dot | 1.11 | 1.01 | Always add a 1px `--ink` edge (17.0) |
| `--accent-ink` | = `--ink` | Text on accent | 16.08 on accent | | ✅ |
| `--accent-hover` | `#FFF9A6` | Accent under the pointer | | | Keep the edge |
| yellow text | `--accent` on `--ink` only | Time readout, loading % | 16.08 | | ✅ Never on white (1.11) |
| `--border-outer` | ink at 13% | Island outline (decorative, backed by shadow) | 1.31 | | Never the only boundary of a control |
| `--border-subtle` | ink at 8% | Dividers inside panels, tonal button edge | 1.18 | | Decorative |
| `--focus-ring` | `--ink`, 2px | `:focus-visible` outline, 2px offset | 17.00 | 16.30 | ✅ On the viewport, add a 2px `--bg-elev` halo (ink on dark road is 2.25) |
| `--status-failed` | `#8D3418` | Failed source: dot and text | 7.70 | 7.04 | ✅ |
| `--status-ok` | `#478C33` | Loaded source: **dot only** | 4.01 | | ✅ UI, ❌ text. For text use `--status-ok-text` `#2E6B4F` (6.09) |
| `--status-warn` | `#D97724` (`--hud-zone-orange`) | Estimate or warning bars and dots | 3.07 | 2.81 | Fill only; always pair with a word |
| `--status-idle` | `#B8B2A7` | Unused source dot | 2.04 | | ❌ alone. Always add the word ("Not used") |

Colour is never the only signal: a state change also changes the weight, the edge, or the label (accent always comes with its ink edge and 700 weight).

## 5. Spacing

**4pt grid.** Layout spacing (between rows, sections, islands, and panel padding) uses only 4/8/12/16/24/32. Inside a control, 2px and 6px are allowed: icon-to-label gaps, track padding, and the gap between segments. Off-grid values (3, 5, 7, 9, 10, 11, 13) round to the nearest token.

| Token | px | Where |
|---|---|---|
| `--space-0-5` | 2 | Segment track padding, gap between segments, gap between outliner rows (inside controls only) |
| `--space-1` | 4 | Toolbar-island padding, chip padding-y, gap from KPI cell to label |
| `--space-1-5` | 6 | Icon-to-label gap, row padding-x, KPI grid gap (inside controls only) |
| `--space-2` | 8 | Row gap inside a section, header → content, button padding-x (sm), **min gap between HUD islands**, gap from rail to outliner |
| `--space-3` | 12 | **Panel padding** (all sides), section gap, button padding-x (md), gap from header row to panels |
| `--space-4` | 16 | Landing chrome inset, gap between groups in the bottom workbench |
| `--space-6` | 24 | Empty or loading-state padding |
| `--hud-inset` | **14** | Distance from an island to the viewport edge. This is a deliberate legacy exception: every island position derives from it (68 = 14 + 42 + 12) and the verify harness keys off it. Don't copy 14 anywhere else. |

## 6. Radius, borders, elevation

| Token | Value | Use (collapses) |
|---|---|---|
| `--radius-xs` | 4px | Checkboxes, swatches, tags (2, 3, 3.5) |
| `--radius-sm` | 6px | Controls ≤ 28px: segments, rows, chips (square), tonal buttons, tooltips (5, 5.5) |
| `--radius-md` | 8px | 30–32px buttons, segment tracks, KPI cells, inputs inside panels (7, 9, 10) |
| `--radius-lg` | 12px | Every HUD island, popover and console (11, 13) |
| `--radius-pill` | 999px | Recent-chip row, round chips (99px) |
| circle | 50% | Dots, compass, avatar marks |

Nested rule: inner radius = outer radius − padding (a track of 8 with 2px padding gets segments of 6).
Borders: islands use 1px `--border-outer`. Dividers are a 1px `--border-subtle` line at full panel width. Accent fills get `inset 0 0 0 1px var(--ink)` (use an inset shadow, not a border, so the size doesn't shift). Nothing inside the right inspector has its own border or a second surface beyond `--bg-sub` cells.

| Elevation | Token | Use |
|---|---|---|
| 0 | none | Anything inside an island |
| 1 | `--shadow-raised`: `0 1px 2px rgb(20 20 19 / 8%)` | Selected white segment |
| 2 | `--shadow-hud` (existing 3-layer) | Islands, popovers, search results |
| CTA | `--shadow-cta`: `0 6px 16px rgb(255 245 0 / 35%), 0 2px 4px rgb(0 0 0 / 8%)` | Create model only |

## 7. Components

Control heights: `--control-xs` 24 · `--control-sm` 28 · `--control-md` 32 · `--control-lg` 44 (Create model only). **The minimum is 24×24px** (WCAG 2.5.8). Desktop pointer precision makes 28–32 the normal range. 44 is kept for the one hero action, which follows Fitts's law.

| Component | Size | Type | Fill / text | States |
|---|---|---|---|---|
| **Primary** (accent) | md 32, padding-x 12, r 8 | sm 600 | `--accent` / `--ink`, 1px ink edge | hover `--accent-hover`; active `--accent` + `translateY(1px)`; focus ring; disabled = `--bg-sub` fill, `--ink-3` text, no edge, `cursor: not-allowed` |
| **Inverse** (secondary) | md 32, padding-x 12, r 8 | sm 600 | `--ink` / `--on-ink` | hover ink at 88%; same focus and disabled rules |
| **Tonal** | sm 28 (xs 24 in bars), padding-x 8, r 6 | caption 600 | `--bg-sub` / `--ink-2`, 1px `--border-subtle` | hover `--bg-elev` + `--ink` |
| **Ghost** | sm 28 / md 32, padding-x 8–12, r 6–8 | sm 500 | transparent / `--ink-2` | hover `--bg-sub` + `--ink` |
| **Icon** | 28×28 (sm) or 32×32 (md); icon 16 | – | as ghost | needs an `aria-label` and a tooltip |
| **Rail button** | 40×42 in a 52 rail (icon 16 + micro label) | micro 600 | ghost; active = accent + ink edge, 700 | if a 10px label clips, widen the rail to 56 (= `--sidebar-rail-w`) |
| **Create model CTA** | lg 44, padding-x 20, r 12 | Outfit 700, title 16 | accent + ink edge + `--shadow-cta` | the only lg control. Loading = `cursor: progress`, label "Building…" |
| **Search / omnibox** | 42 island, padding 0 6 0 12, r 12; icon 16 `--ink-3` | body 500 | `--bg-card`; results popover `--bg-elev`, r 12, padding 4, 6 below | **focus-within: `0 0 0 2px var(--ink)` ring** (missing today); clear button 20 round `--bg-sub` |
| **Chip** | xs 24, padding 4 8, r pill | caption 500 | `--bg-sub` / `--ink-2` | hover `--bg-elev` + ink; selected `--ink` / `--on-ink`, 600 |
| **Segmented** | track `--bg-sub`, padding 2, r 8; segment sm 28 (xs 24 in dense bars), r 6 | caption 600 | inactive transparent / `--ink-3` | **Mode** (one per island: 3D/Drawing/Satellite, view style, rail, active hour) = accent + ink edge, 700. **Sub-option** (projection, inspector tabs, dates) = `--bg-elev` + `--shadow-raised`, `--ink` |
| **Panel / section header** | – | micro, `--ink-3`; meta on the right in mono caption `--ink-3` | – | 8 to content, 12 between sections, 1px `--border-subtle` divider between sections |
| **List row** (outliner) | sm 28, padding 0 6, r 6, gap 8; checkbox 14 r 4; swatch 12 circle | sm 500 `--ink`; count mono caption `--ink-3` | transparent | hover `--bg-sub`; off = text `--ink-3` + empty box with a **1px inset `--ink-3` edge** (no `opacity: .55`); checked box = `--ink` with an accent tick |
| **KPI cell** | 4-up grid, gap 6, padding 6, r 8 | value mono body 600; label micro `--ink-3` | `--bg-sub` | – |
| **HUD island** | toolbar islands 42 high (32 control + 4 + 4 + 1 + 1), padding 4; panel islands padding 12 | – | `--bg-card`, blur 18 / saturate 150%, 1px `--border-outer`, `--shadow-hud`, r 12 | z `--z-hud` |
| **Tooltip** | padding 4 8, r 6, 8 from the trigger | sm 500 | `--ink` / `--on-ink` | appears after 300ms hover, or at once on focus; fades in `--dur-fast` |

## 8. Layout (1440×900 reference; must also hold at 1280×800)

| Region | Position / size (measured) | Rule |
|---|---|---|
| Header islands (left, centre, right) | top 14, height 42; left and right at 14 from the edges; centre centred | ≥ 8 gap between them (1280 measures exactly 8; don't add width at 1280). New cut and Reset are icon-only with tooltips (32×32 icon buttons at every width; Kelvin's go 21 Nov 2026, idea from 19 Nov 2026) |
| Left tool rail | x 14, y 68, w 52 | 8 to the outliner. Display, Import and Export only; no Analysis icon (Kelvin, 21 Nov 2026) |
| Left outliner | x 74, y 68, w 248, max-h `100vh − 134` | scrolls inside itself; padding 12 |
| Right inspector (SITE INTELLIGENCE) | right 14, y 68, w 268, max-h `100vh − 134` | border 0, uniform `--bg-card`, no inner borders, no legacy `#DBDBDB`/`#EBEBEB` |
| Bottom bar (solar) | bottom 14, centred, h 40 | Satellite only |
| Analysis env console | bottom 14, centred, min-w `min(720px, 100vw − 32)`, min-h 76, always two rows, padding 8 12, r 12 | always on in 3D and Drawing (Kelvin, 21 Nov 2026), with an "Analysis" header and no Site Analysis rail button; must clear the outliner and inspector. The bar always shows the full Solar Study layout (mode chips, ALT/AZ/DAYLIGHT, Shadows / Sun hours / 3D Sun Dome, date presets and the time slider), even when every analysis is off; those solar controls stay visible but inactive until Solar Study is turned on. Wind Rose and Viewshed Walk swap their own rows in when they are on. A compact High / Fast render-quality switch sits at the right end of the top row (Kelvin, 22 Nov 2026). |
| Landing | brand pill and omnibox at top 16; workbench at the bottom | omnibox w 540, max `100vw − 440` |

**No overlap:** no two islands may intersect, with a minimum gap of 8px at 1280×800 and 1440×900 (the verify harness checks this at 1440 only, so check 1280 by eye). New UI joins an existing island or takes a free slot; it never floats over another island.

| z-index token | Value | Layer |
|---|---|---|
| `--z-viewport` | 1–9 | In-canvas overlays (frame, handles, plan fill, notices). Local stacking only |
| `--z-frame-tag` | 20 | Selection-frame dimension tag |
| `--z-hud` | 30 | Every island, and the landing chrome |
| `--z-hud-over` | 32 | Env console (sits over the bottom bar slot) |
| `--z-popover` | 40 | Search results, export menu, dropdowns |
| `--z-toast` | 50 | Loading pill, status toasts |
| `--z-modal` | 100 | Shortcut cheatsheet and its backdrop |

## 9. Motion

| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 120ms | Hover and press colour, tooltips, checkbox (100–200 band) |
| `--dur-base` | 200ms | Popovers, segment slide, panel content swap |
| `--dur-slow` | 300ms | Island show and hide, drawer open |
| `--dur-reveal` | 600ms, stagger 267ms | **Only** the post-build HUD reveal (the verify harness times it). Not for anything else |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Things entering |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Things leaving |
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | State changes in place |

Reduced motion (MUST): under `prefers-reduced-motion: reduce`, set movement (translate, scale, camera fly) to 0ms and allow only opacity fades of `--dur-fast` or less. JS-driven motion (camera, wind streaks, ripples) checks `matchMedia` the same way `Scene3D.tsx` and `windStreakMotion.ts` already do. Animate only `opacity`/`transform`, never `box-shadow` or layout.

## 10. Cleanup list (for a later code pass, not this PR)

| # | Where | Now | → Token |
|---|---|---|---|
| 1 | `floating.css:392–393` `--ink-3` / `--ink-muted` | `#787670` (4.39 on card, 4.02 on sub, 4.20 on KPI) | `#6B6963` (5.31 / 4.85 / 5.08). **Contrast fail: do first** |
| 2 | `floating.css:561` omnibox input `outline:none !important`, and no `:focus-within` on `.omnibox` | invisible focus (measured: no change on focus) | `.omnibox:focus-within{box-shadow:var(--shadow-hud),0 0 0 2px var(--ink)}`. **WCAG 2.4.7** |
| 3 | `floating.css:1588` `.o-eye:not(.on)` and `:1528` `.mini-chk:not(.on)` | 14% ink fill, 1.34:1 | add `inset 0 0 0 1px var(--ink-3)` (5.31). **WCAG 1.4.11** |
| 4 | `floating.css:1562` `.o-row.is-off{opacity:.55}` | text 4.04:1 | `color: var(--ink-3)`, no opacity |
| 5 | `floating.css:1797, 3038` `.kpi-lbl`; `:1351, 2520, 2546` rail labels; `:999, 1524, 1583` | 8.5px / 9px | `--fs-micro` 10px |
| 6 | `floating.css:636, 831, 1962, 2326, 3855, 4007, 4068, 4147` | 9.5px | `--fs-micro` (caps) or `--fs-caption` |
| 7 | `floating.css:1098, 1998`; `index.css:262, 305` | 12.5px | `--fs-sm` 12px |
| 8 | `floating.css:565`; `index.css:151` | 13.5px | `--fs-body` 13px |
| 9 | `floating.css:494` (16.5), `:1024` CTA (14.5) | off-scale | `--fs-title` 16px |
| 10 | 11.5px ×17 (e.g. `floating.css:1291, 1308` export buttons, `:1553` rows) and 10.5px ×22 (`:1450, 1475, 1602, 1709, 1920`) | half-pixel steps | 11.5 → `--fs-sm` 12; 10.5 → `--fs-caption` 11 |
| 11 | `floating.css:31` `.sidebar{color:var(--sidebar-text)}` (`#000`), and `--text`/`--float-ink` `#1A1916` | three near-identical inks | alias all of them to `--ink` |
| 12 | `floating.css:2627–2630`, `389` `--hud-kpi-bg` F7F6F2, `--hud-sub-toggle-bg` F5F4F0, `--hud-track-bg`, `--track-bg`; `--hud-muted` 5A5850 | five near-duplicate greys | `--bg-sub`; `--hud-muted` → `--ink-2` |
| 13 | radius 11px ×9 / 13px ×3 (`floating.css:453, 535, 615, 1045, 1148, 1238, 1325, 1384, 1683`); 7px ×27; 5 / 5.5px ×26 | 3 island radii, 4 control radii | `--radius-lg` 12 / `--radius-md` 8 / `--radius-sm` 6 |
| 14 | font-weight 560 ×12 (`index.css:261, 280, 301, 413…`), 650 (`floating.css:69`), 800 ×4 (`floating.css:1000, 1525, 1584, 3132`) | 7 weights | 500 / 600 / 700 |
| 15 | `index.css:205–206` `.rail-tip` `#16140f`/`#fff`, `transition: opacity 80ms linear`; `index.css:401, 643` `0.15s ease` | raw hex, linear easing | `--ink` / `--on-ink`, `--dur-fast var(--ease-out)` |
| 16 | `StudioCompass.tsx:36`, `DrawingPlan.tsx:333` `fontFamily="Inter, …"` | third family (renders Inter in the HUD compass) | `var(--sans)` in the compass; for the plan, check that the .ai/SVG export still embeds correctly before you change it |
| 17 | `floating.css:3756` `.loading-pulse-dot{box-shadow:0 0 8px #FFF500}`; `:3422, 3601` `box-shadow 1314ms` | glow (CLAUDE.md bans glow), shadow animation | ink edge, no glow; animate opacity/transform |
| 18 | MapLibre zoom controls (landing) | default blue focus glow `rgb(0 150 255)` (2.98) | `--focus-ring` |
| 19 | Raw colours outside `:root`: `index.css` ×54, `floating.css` ×98 (e.g. `floating.css:487, 1074, 1083, 1305` `#FFFFFF`) | breaks rule 1 | `--on-ink` / `--bg-elev` / named tokens |
| 20 | `THEME.md:37–38, 94–101` | says Outfit/Fraunces; the app uses Geist | update the doc; `--font-serif` is Geist, so rename it or drop it |
