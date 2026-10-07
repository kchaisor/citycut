# CityCut — notes for coding agents

CityCut cuts a square out of a city and exports a 3D model and a 2D site plan. Behaviour and variables are in README.md and THEME.md; do not copy them here.

## Stack and commands

Vite, React, MapLibre, and three.js. Vite `base` is `/citycut/`. Use `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`, and `npm run preview`. GitHub Pages deploys on push to `main` via `.github/workflows/pages.yml` (https://kchaisor.github.io/citycut/).

## File map

- `src/colours.css` — every fill, read with `getColour` (`src/lib/colours.ts`).
- `src/drawing-style.css` — site-plan lines: weight, colour, and dash.
- `src/theme.css` — fonts, sizes, and chrome colours.
- `src/lib/aiPlan.ts`, `src/lib/aiView.ts`, `src/lib/aiDocument.ts` — Illustrator `.ai`.
- `src/lib/rhinoExport.ts` — Rhino `.3dm`. `src/lib/capturePng.ts` — 3D-view PNG.
- `src/lib/buildCity.ts` — Three.js group for the viewport and the mesh exports.
- `src/lib/svgPlan.ts`, `src/components/DrawingPlan.tsx` — on-screen SVG plan.
- `src/lib/vicmapContours.ts`, `src/lib/terrain.ts` — contours. `src/lib/vicmapTrees.ts` — Vicmap trees.
- No city `.glb` exporter. Downloads are PNG, `.3dm`, and `.ai`.

## House rules

- No stray hex or `rgb(` in app TypeScript. `src/lib/colours.test.ts` is the Vitest guard; keep it green.
- Fills only in `src/colours.css`. Lines only in `src/drawing-style.css`. Update THEME.md when you add a variable.
- Keep the attribution when you add a data source.
- On a failed external endpoint, abort or fall back. Never invent data.

## QA

- Batch related work into one run and one PR.
- Run `npm test` and `npm run typecheck` on every PR.
- Screenshots only for a visual change: one desktop shot by default, adding mobile or 3D only when relevant. Docs-only PRs need no screenshots.
