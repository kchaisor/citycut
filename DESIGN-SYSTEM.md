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

3D wind-stream fills (Kelvin, 23 Nov 2026) live in `src/colours.css`: `--wind-stream-1` `#6D9BC7` (strongest direction, soft dusty blue), `--wind-stream-2` `#8FBEA3` (second, soft sage), `--wind-stream-3` `#C3A6CF` (third, soft lilac). They are fills only, with no ink edge, for the wind-streak arrows in 3D and their legend swatches; they stay in colour in the B&W View Style. `--on-ink` `#FFFFFF` is defined in `src/theme.css`.

Colour is never the only signal: a state change also changes the weight, the edge, or the label (accent always comes with its ink edge and 700 weight).

## 5. Spacing

**4pt grid.** Layout spacing (between rows, sections, islands, and panel padding) uses only 4/8/12/16/24/32. Inside a control, 2px and 6px are allowed: icon-to-label gaps, track padding, and the gap between segments. Off-grid values (3, 5, 7, 9, 10, 11, 13) round to the nearest token.

| Token | px | Where |
|---|---|---|
| `--space-0-5` | 2 | Segment track padding, gap between segments, gap between outliner rows (inside controls only) |
| `--space-1` | 4 | Toolbar-island padding, chip padding-y, gap from KPI cell to label |
| `--space-1-5` | 6 | Icon-to-label gap, row padding-x, KPI grid gap (inside controls only) |
| `--space-2` | 8 | Row gap inside a section, header → content, button padding-x (sm), **min gap between HUD islands**, gap from rail to outliner |
| `--space-3` | 12 | **Panel padding** (all sides) for left-hand panels, section gap, button padding-x (md), gap from header row to panels |
| `--space-4` | 16 | Landing chrome inset, gap between groups in the bottom workbench, **padding of both right-hand stack cards** (Site Intelligence and the wind-rose card), the Analysis bar's lane gutters, and the gap under the wind card's footer divider (Kelvin's yes to Designbot, 22 Nov 2026) |
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
| **Segmented** | track `--bg-sub`, padding 2, r 8; segment sm 28 (xs 24 in dense bars), r 6 | caption 600 | inactive transparent / `--ink-3` | **Mode** (one per island: 3D/Drawing/Satellite, view style, rail, active hour) = accent + ink edge, 700. **Sub-option** (projection, inspector tabs, dates) = `--bg-elev` + `--shadow-raised`, `--ink`. The 3D view-style segment carries five labels (Primary / Use / Src / Card / B&W) on one row: 32 high, Geist 11 / 500 (active 600), segment padding 0 8, with the track edge drawn as an inset 1 px line so the labels fit the 222 px track; "Source" is shortened to Src (accessible name stays "Source") because the five full labels do not fit at that size (Kelvin, 23 Nov 2026, 12:55 AM AEDT; was 28 / 10.5 / 0 4) |
| **Panel / section header** | – | micro, `--ink-3`; meta on the right in mono caption `--ink-3` | – | 8 to content, 12 between sections, 1px `--border-subtle` divider between sections |
| **List row** (outliner) | sm 28, padding 0 6, r 6, gap 8; checkbox 14 r 4; swatch 12 circle | sm 500 `--ink`; count mono caption `--ink-3` | transparent | hover `--bg-sub`; off = text `--ink-3` + empty box with a **1px inset `--ink-3` edge** (no `opacity: .55`); checked box = `--ink` with an accent tick |
| **KPI cell** | flat 4-up row, gap 8, no padding, no radius (Kelvin's yes to Designbot, 22 Nov 2026) | value mono `--fs-title` 16 600 tabular; label micro `--ink-3` | transparent on `--bg-card` (no `--bg-sub` tile) | – |
| **Slider** | 32 hit area, 4 track (`--slider-track`, filled part `--ink`), 16 round thumb `--bg-elev` + 1px `--border-outer` + `--shadow-raised`, tick at the default | live mono readout (e.g. `1.0×`), Fewer / More caption `--ink-3` | – | focus ring 2px `--ink`, 2px offset |
| **Collapsible card header** | 48 row (`--hud-card-head`), padding-x 16, chevron 16 | title micro caps `--ink-3`, meta mono caption `--ink-3` | transparent | whole row is the toggle (`aria-expanded`); chevron turns, no transition under reduced motion |
| **HUD island** | toolbar islands 42 high (32 control + 4 + 4 + 1 + 1), padding 4; panel islands padding 12 | – | `--bg-card`, blur 18 / saturate 150%, 1px `--border-outer`, `--shadow-hud`, r 12 | z `--z-hud` |
| **Tooltip** | padding 4 8, r 6, 8 from the trigger | sm 500 | `--ink` / `--on-ink` | appears after 300ms hover, or at once on focus; fades in `--dur-fast` |

## 8. Layout (1440×900 reference; must also hold at 1280×800)

| Region | Position / size (measured) | Rule |
|---|---|---|
| Header islands (left, centre, right) | top 14, height 42; left and right at 14 from the edges; centre centred | ≥ 8 gap between them (1280 measures exactly 8; don't add width at 1280). New cut and Reset are icon-only with tooltips (32×32 icon buttons at every width; Kelvin's go 21 Nov 2026, idea from 19 Nov 2026) |
| Left tool rail | x 14, y 68, w 52 | 8 to the outliner. Display, Import and Export only; no Analysis icon (Kelvin, 21 Nov 2026) |

| Left outliner | x 74, y 68, w 248, max-h `100vh − 134` | scrolls inside itself; padding 12. In 3D its View Style segment has five options on one 222 px row: Primary / Use / Src / Card / **B&W** (32 high, Geist 11 / 500, segment padding 0 8, each segment as wide as its label plus an equal share of the spare width; Src is "Source" shortened to fit, Kelvin, 23 Nov 2026, 12:55 AM AEDT). B&W is the greyscale 3D look; it is a View Style, not part of Solar Study, and a new cut opens in Primary. Drawing keeps Use / Source / Uniform. While B&W is selected, one helper line, "Colours off in B&W" (Geist 11 / 500, `--ink-3`, one line), sits directly under the segment, the 3D Scene Layers swatches preview each layer's grey (the stored colours are untouched), and 3D water is a flat, unlit `--water-3d-mono` (`#D6D6D2`); trees stay mid-grey. The Scene Layers header is one nowrap row in 3D and Drawing: micro-caps title, the "14 visible" count in `--ink-3`, and a quiet text Reset (`--ink-3`, no fill, no border, accessible name "Reset colours") at the right (Kelvin, 23 Nov 2026, 12:55 AM AEDT). The Section Knife and its "Tools" section are not in the drawer; it is out of the live UI until it is reworked (Kelvin, 22 Nov 2026, 11:55 PM AEDT) |
| Right inspector (SITE INTELLIGENCE) | right 14, y 68, w 328 (Kelvin's go on the analysis cards, 23 Nov 2026, 11:45 AM AEDT; was 304, and 268 before 22 Nov 2026) | border 0, uniform `--bg-card`, no inner borders, no legacy `#DBDBDB`/`#EBEBEB`, padding 16 (`--space-4`), 12 between sections. It is the top of the right-hand column (`.right-hud-stack`). Opening or closing Site Intelligence never moves the Analysis bar (Kelvin's go, 22 Nov 2026, 11:13 PM AEDT). It ends its scroll area with a 12px fade to `--bg-card`. While any analysis card is open it folds to its 48 header row (`--hud-card-head`), which becomes the toggle to open it again |
| **Analysis cards** (Solar Study, Wind Rose, Viewshed Walk) | `.right-hud-stack` under Site Intelligence, in that order: 328 wide, right 14, `--space-3` (12) gap, r 12, `--bg-card`, `--border-outer`, `--shadow-hud` | One card per analysis that is on (Kelvin's go, 23 Nov 2026, 11:45 AM AEDT); they hold every control that used to sit in the Analysis bar's extra rows. Each has a 48 header row (`--hud-card-head`: title in micro caps, live meta in mono, chevron) that is the toggle. **Accordion:** all headers stay visible, only the analysis turned on last starts open, and clicking a folded header opens it and folds the one that was open; one analysis body is open at a time. Body: padding 0 16 16, 8 gap, sections split by a `--border-subtle` rule with 8 above, type 10 / 11 / 12. **Shared layout:** a left-aligned 80 label column (`--analysis-label-col`) for readouts and pill rows, so values and pills start on one x; equal-width segmented rows of 2, 3 or 5 (`.ac-seg`), 28 high, r 6, `--bg-sub`, 11 / 600, always one line (`white-space: nowrap`); a selected choice (date, season, design wind, eye height, radius, speed) is `--ink` with `--on-ink` text; an overlay that is on (Shadows, Sun hours, Sun dome, Flow, Streaks, Draw path) is `--accent` with a 1px `--ink` inset; badges (time, prevailing, walk position) are `--ink` with `--accent` mono text and sit left under their section, never pushed to the right edge; metre and density readouts follow their label. Short labels: **Sun dome**, **Flow**, **Streaks**, **Density**. The column stops 16 above the Analysis bar while a card is open (about 748 high at 900, 648 at 800) and an open body scrolls inside its card. **Solar Study:** ALT / AZ / Daylight, Shadows / Sun hours / Sun dome (plus 9–3pm Plan Fan on the Drawing site plan), three date pills, play, sunrise, the 06–20 slider with its hour labels under the rail, sunset, the time badge, the Sun dome size slider (3D only, muted with a note while the dome is off) and, when Sun hours is on, the Direct Sun Hours legend inside the card. **Wind Rose:** the rose, station line, velocity scale and prevailing streams, then Season (5), Design winds (a compact left group), the Prevailing badge, and Flow / Streaks / Pause with the Density slider on one row; in Plan the Wind speed / Comfort and Arrows switch sits at the top of the card instead of the overlays. The rose is at least 176 wide (`--wind-rose-size`) when Wind Rose is the only analysis and the window is 860 or taller, and 124 (`--wind-rose-size-tight`) when another analysis shares the column or the window is shorter. **Viewshed Walk:** a hint, Draw path / Compute, Eye height and Radius pills, Play with 1× / 4× / 8× and Clear, the position slider with its badge, and the view legend. If Sun hours is left on while Solar Study is off, its legend shows as a small card of its own in the same column |
| Bottom bar (solar) | bottom 14, centred, h 40 | Satellite only |
| Analysis env console | bottom 14, centred, one row, 54 high (28 row, padding 12, 1 border), width = its content (about 540), r 12 | always on in 3D and Drawing (Kelvin, 21 Nov 2026), with an "Analysis" header and no Site Analysis rail button. Since 23 Nov 2026 (Kelvin's go, 11:45 AM AEDT) it is **always one row**: the ANALYSIS header, the Solar Study / Wind Rose / Viewshed Walk toggles, and the High / Fast render-quality switch at the right. High / Fast stays here because it is global (Direct Sun Hours resolution and 3D render quality). Everything else lives on the analysis cards in the right-hand column, and the bar carries no muted solar controls when Solar Study is off. Solar Study, Wind Rose and Viewshed Walk are independent toggles. The bar is centred in the lane between the left rail (or open outliner, when it reaches down to the bar; else 16 from the edge) and the right edge, with a **16 gutter** (`--space-4`); the right-hand column stops 16 above it while an analysis card is open, so the cards never take lane from the bar, and it fits at 1280×800 and 1440×900. Yellow stays on the modes and High / Fast. Clicking Solar Study turns Shadows and the sun dome on together, and Solar Study does not grey the 3D scene: black and white is the **B&W** View Style in the left drawer (Kelvin, 22 Nov 2026, 11:55 PM AEDT). |

| Transport legend (Drawing → Exploded axo) | x 330 (8 right of the open outliner's 322 edge) or x 74 when the outliner is closed (8 right of the rail); no fixed bottom: it sits 8 above the measured top of the Analysis bar, wrapped rows included, or of the flat-ground toast (`.stage-error`) when that sits above the bar (`--transport-legend-bottom`, set by `useRightHudLayout`; Kelvin's go, 22 Nov 2026, 5:12 PM AEDT); w 156, padding 10 12 | Shows only when Exploded axo is on and the Transport plate is visible with a legend or a failed load (then it reads "Unavailable"). A stage island, never on the axo plate and never on the right (the right column belongs to Site Intelligence and the wind rose). Title `TRANSPORT` in `--fs-micro` 700 caps `--ink-3`; rows Train / Tram / Bus in `--fs-caption` 500 `--ink-2`, each with a 22×3 line sample in `--axo-pt-train` / `--axo-pt-tram` / `--axo-pt-bus`, gap 6. HUD island chrome; `pointer-events: none`; hook `data-transport-legend` (Kelvin, 22 Nov 2026). In the Illustrator export the same legend sits in the top-left sheet margin, and the transport source credit goes in the footer |
| Landing | brand pill and omnibox at top 16; workbench at the bottom | omnibox w 540, max `100vw − 440` |

**No overlap:** no two islands may intersect, with a minimum gap of 8px at 1280×800 and 1440×900 (16 between the Analysis bar and the side columns, in X when they share a Y range and in Y otherwise; `src/lib/rightHudLayout.test.ts` locks the 1280 case, and the verify harness checks 1440). Wrap rather than overlap. New UI joins an existing island or takes a free slot; it never floats over another island.

| z-index token | Value | Layer |
|---|---|---|
| `--z-viewport` | 1–9 | In-canvas overlays (frame, handles, plan fill, notices). Local stacking only |
| `--z-frame-tag` | 20 | Selection-frame dimension tag |
| `--z-hud` | 30 | Every island, and the landing chrome |
| `--z-hud-over` | 32 | Env console (sits over the bottom bar slot) |
| `--z-popover` | 40 | Search results, export menu, dropdowns |
| `--z-toast` | 50 | Loading pill, status toasts |
| `--z-modal` | 100 | Shortcut cheatsheet and its backdrop |

### 3D Sun Dome (Designbot review, 21 Nov 2026)

| Part | Rule |
|---|---|
| Size | Centred on the cut. Auto radius = 0.6 × the cut's half-diagonal, clamped to 120–350 m (`sunDomeRadiusM`). The Sun dome size slider on the Solar Study card runs from 0.5 × that auto radius to the cut edge (the cut's half-diagonal), starts on auto (tick on the track), reads out metres and updates the dome live without re-fitting the camera (Kelvin, 23 Nov 2026). It is not the old `?heliodon=` radius factor. |
| Camera | On turn-on, ease 250 ms to frame the dome itself (its radius and height, not the whole cut) in the safe area: the viewport minus the live HUD island rects plus 16 px. Reduced motion jumps. |
| Lines | Fixed-pixel lines (Line2 / `LineMaterial`); dashes are in pixels too. At most three styles: selected date solid 2 px `--ink`; other key dates 1 px `--ink-3` (21 Jun dashed 6/4, 22 Dec dotted 2/3, equinox dashed 2/4); hour lines 0.75 px `--ink` at 35%. Horizon ring and ticks 1 px `--ink` at 25%. |
| Labels | Constant screen size (canvas sprites rescaled every frame, never metre-sized type). Hour labels 09h / 12h / 15h on the selected path only, Geist Mono 11/600 tabular, 6 px outside the path. Date labels "21 Jun" / "22 Dec", Geist 11/500 `--ink-2`, at the sunset end. Bearings every 30° in 10/700, 0.08 em, `--ink-3`; N / E / S / W at 20/700 (twice the bearing numbers; Kelvin, 22 Nov 2026), `--ink`. Ticks every 10°, 4 px. |
| Halo | Dome labels only: a 2 px knock-out in the 3D background colour, drawn into the label's canvas, so text stays legible where it crosses a line. This is the one exception to "no text outlines" and never applies to HUD text. |
| Accent | Only the sun: 14 px `--accent` dot (was 10 px; about 1.4×, Kelvin 22 Nov 2026), 1 px `--ink` edge, and a 1 px `--ink` dashed 4/3 line from the sun to the dome centre (not a vertical drop to the ground). No yellow lines, no rayed sun. |
| Visibility | Only while Solar Study is on and the Sun dome chip on its card is on. |
| Key | None. The inline 21 Jun / 22 Dec / Equinox / Hours / Sun legend that sat beside the dome chip is removed; it is not moved elsewhere. The High / Fast quality switch stays at the right of the top row (Kelvin, 22 Nov 2026). |

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

Reduced motion (MUST): under `prefers-reduced-motion: reduce`, set movement (translate, scale, camera fly) to 0ms and allow only opacity fades of `--dur-fast` or less. JS-driven motion (camera, wind streaks, ripples) checks `matchMedia` the same way `Scene3D.tsx` and `windStreakMotion.ts` already do. Animate only `opacity`/`transform`, never `box-shadow` or layout. The wind ground-flow and the wind-streak arrows share one pause: under reduced motion they start paused, and Play at the end of the wind row (or "Animate anyway" on the slider) starts them (Kelvin, 23 Nov 2026).

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
