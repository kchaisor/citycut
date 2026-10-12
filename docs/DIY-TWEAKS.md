# DIY tweaks cheat sheet

Tiny visual edits for Kelvin (architect, not a developer). Edit on GitHub’s web editor — no local coding run. Line numbers below match commit `afa68fd` on `main` (Oct 2026). Prefer the **SHA permalink** (stable). The **main** form also works but may drift after later commits.

**Permalink forms**

- SHA: `https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/<path>#L<n>`
- Branch: `https://github.com/kchaisor/citycut/blob/main/<path>#L<n>`

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
| [`src/theme.css`](https://github.com/kchaisor/citycut/blob/main/src/theme.css) | Fonts, font sizes, UI chrome, **`--accent`**, sidebar rail/panel widths | Source for chrome. `THEME.md` is a human guide — optional to update. |
| [`src/colours.css`](https://github.com/kchaisor/citycut/blob/main/src/colours.css) | Every **fill** (plan, 3D, PNG, Illustrator, Rhino layers) | **Source.** [`src/lib/colours.ts`](https://github.com/kchaisor/citycut/blob/main/src/lib/colours.ts) *reads* this file — do **not** hand-edit hexes there. |
| [`src/drawing-style.css`](https://github.com/kchaisor/citycut/blob/main/src/drawing-style.css) | Line weights (mm), dashes, frame / site-boundary pens | Source for pens. |
| [`THEME.md`](https://github.com/kchaisor/citycut/blob/main/THEME.md) | Longer explanation of the same tokens | Docs only; CSS wins if they disagree. |

`--accent` (`#FFF500` in theme) and `--site-building` (`#FFF500` in colours) are **separate**. Changing one does **not** change the other.

---

## Colours (accent + key fills)

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Accent fill | `src/theme.css` · L75 | `--accent: #FFF500` | [L75](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/theme.css#L75) |
| Accent ink / edge / hover | `src/theme.css` · L78–L84 | `#1A1916` / `#1A1916` / `#FFF9A6` | [L78](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/theme.css#L78) |
| Page grey | `src/theme.css` · L10 | `--background: #EBEBEB` | [L10](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/theme.css#L10) |
| Site building (yellow massing) | `src/colours.css` · L42 | `--site-building: #FFF500` | [L42](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/colours.css#L42) |
| Site boundary colour | `src/colours.css` · L48 | `--site-boundary: #D7263D` | [L48](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/colours.css#L48) |

Docs table for accent: `THEME.md` L48. Main-branch example: [`…/blob/main/src/theme.css#L75`](https://github.com/kchaisor/citycut/blob/main/src/theme.css#L75).

---

## Font sizes

| Token | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Body | `src/theme.css` · L46 | `--font-size: 15px` | [L46](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/theme.css#L46) |
| Brand (CityCut) | `src/theme.css` · L49 | `18px` | [L49](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/theme.css#L49) |
| Drawer / card / stat / title | `src/theme.css` · L52–L61 | `15` / `16` / `22` / `28px` | [L52](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/theme.css#L52) |
| Sidebar body type | `src/index.css` · L1238 | `font-size: 13px` | [L1238](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L1238) |

---

## Sidebar width (`--sidebar-w` / `--sidebar-h`)

| What | File · line | Notes | SHA link |
| --- | --- | --- | --- |
| Rail width | `src/theme.css` · L117 | `--sidebar-rail-w: 56px` | [L117](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/theme.css#L117) |
| Panel width | `src/theme.css` · L118 | `--sidebar-panel-w: 320px` | [L118](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/theme.css#L118) |
| `--sidebar-w` (desktop) | `src/index.css` · L1219 | `calc(rail + panel)` | [L1219](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L1219) |
| `--sidebar-h` (phone) | `src/index.css` · L1621 | `calc(52px + min(42vh, 360px))` | [L1621](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L1621) |

Prefer editing **rail/panel** in `theme.css`; `--sidebar-w` / `--sidebar-h` are derived in `index.css`.

---

## Key spacing & padding

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Sidebar head pad | `src/index.css` · L1288 | `20px 24px 0` | [L1288](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L1288) |
| Sidebar body pad | `src/index.css` · L1305 | `0 24px 16px` | [L1305](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L1305) |
| Sidebar foot pad | `src/index.css` · L1314 | `16px 24px` | [L1314](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L1314) |
| Group pad | `src/index.css` · L1357 | `20px 0` | [L1357](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L1357) |
| Rail pad / gap | `src/index.css` · L1247–L1248 | `12px 0` / `4px` | [L1247](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L1247) |

---

## Outline & dashed-frame line weights

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Cut / plan **frame** weight | `src/drawing-style.css` · L73 | `--frame-stroke-mm: 0.35` | [L73](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/drawing-style.css#L73) |
| Frame dash | `src/drawing-style.css` · L75 | `--frame-dash: none` | [L75](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/drawing-style.css#L75) |
| **Site boundary** weight | `src/drawing-style.css` · L98 | `--site-boundary-mm: 0.35` | [L98](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/drawing-style.css#L98) |
| Site boundary dash-dot | `src/drawing-style.css` · L100 | `2.4 0.6 0.2 0.6` (mm) | [L100](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/drawing-style.css#L100) |

---

## Border radius (key UI)

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Rail icon button | `src/index.css` · L1259 | `8px` | [L1259](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L1259) |
| Sidebar primary (Create/Export) | `src/index.css` · L1326 | `6px` | [L1326](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L1326) |
| Generic `.primary` | `src/index.css` · L481 | `8px` | [L481](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L481) |

---

## Opacity (key)

| What | File · line | Value | SHA link |
| --- | --- | --- | --- |
| Tree fill on plan | `src/drawing-style.css` · L87 | `--tree-fill-opacity: 0.7` | [L87](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/drawing-style.css#L87) |
| Disabled primary | `src/index.css` · L486 | `0.45` | [L486](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L486) |
| Sidebar primary hover | `src/index.css` · L1331 | `0.92` | [L1331](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L1331) |
| Height-bar LiDAR hatch | `src/index.css` · L1424 | `0.55` | [L1424](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/index.css#L1424) |

---

## User-facing labels

| Label | File · line | SHA link |
| --- | --- | --- |
| Model sections: Model details, Buildings, Trees, Drawing, Sun, Wind, Export | `src/lib/sidebarSections.ts` · L14–L21 | [L14](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/lib/sidebarSections.ts#L14) |
| Landing rail: Place, Cut, Layers | `src/components/SelectChrome.tsx` · L29–L40 | [L29](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/components/SelectChrome.tsx#L29) |
| Layer row names | `src/components/SelectChrome.tsx` · L20–L26 | [L20](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/components/SelectChrome.tsx#L20) |
| **Create model** | `src/components/SelectChrome.tsx` · L171 | [L171](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/components/SelectChrome.tsx#L171) |
| **Export model** | `src/components/ModelPage.tsx` · L1258 | [L1258](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/components/ModelPage.tsx#L1258) |

Change only the quoted string. Leave `id` / `key` values alone.

---

## Credit text

| Credit | File · line | SHA link |
| --- | --- | --- |
| Base attribution | `src/lib/dataCredits.ts` · L3–L4 | [L4](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/lib/dataCredits.ts#L4) |
| Byline | `src/lib/dataCredits.ts` · L14 | [L14](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/lib/dataCredits.ts#L14) |
| CoM trees plain / HTML | `src/lib/comTreesCredit.ts` · L13–L14, L27–L29 | [L14](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/lib/comTreesCredit.ts#L14) |
| CoM building heights | `src/lib/comBuildingHeightCredit.ts` · L14–L15 | [L15](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/lib/comBuildingHeightCredit.ts#L15) |
| Model footer (assembles credits) | `src/components/ModelPage.tsx` · L1985–L1999 | [L1988](https://github.com/kchaisor/citycut/blob/afa68fdccbc81fc9afd9e0ab68f11b50c22d234c/src/components/ModelPage.tsx#L1988) |

**Keep licence names, © holders, and dataset titles accurate.** Cosmetic wording only; do not drop required attribution.

---

## NOT safe to DIY

- **`.ts` / `.tsx` logic** beyond a literal string or a simple number in a label/credit constant (conditionals, imports, JSX structure).
- **Export code** (`.ai` / `.3dm` / PDF builders under `src/lib/*Export*`, `aiPlan`, Rhino helpers).
- **Workflows** under `.github/`.
- **`pipeline/`** and data build scripts.
- **Data URLs and credit licence terms** — must stay legally accurate; tests assert exact credit strings (`dataCredits.test.ts`, `comTreesCredit.test.ts`, `comBuildingHeightCredit.test.ts`, `creditLinks.test.ts`).
- **Colours asserted in tests** — changing these hexes can fail CI until tests are updated:
  - `--site-building` `#FFF500` — `src/lib/siteExport.test.ts` L13
  - `--site-boundary` `#D7263D` — `siteExport.test.ts` L17–L18; dash pattern in `siteBoundaryDash.test.ts`
  - `--background` / `--model-bg` `#EBEBEB` — `drawingSheet.test.ts` L6
  - `--building-solar-neutral` `#FFFFFF` — `sunStudyViewport.test.ts` L7
- **Camera and viewport** code (`MapStage`, camera memory, `qaCameraBridge`, framing helpers).
- **`vite.config` and `base: "/citycut/"`** — breaks Pages paths if wrong.

When in doubt: ask, or revert.
