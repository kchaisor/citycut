# CityCut — Claude Code rules

CityCut (github.com/kchaisor/citycut) cuts a square out of a city and exports a 3D model and a 2D site plan. Stack: Vite, React, TypeScript, MapLibre, three.js. Vite `base` is `/citycut/`. Pushes to `main` deploy to GitHub Pages (https://kchaisor.github.io/citycut/). Behaviour lives in README.md, theme variables in THEME.md, file map and house rules in AGENTS.md. Read AGENTS.md before you start; these rules match Kelvin's Cursor agents.

## Commands

- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build` (typecheck, then `vite build`)
- Preview build: `npm run preview`
- Typecheck: `npm run typecheck`
- Tests: `npm test` (Vitest)
- Pipeline tests: `npm run test:pipeline` (pytest)
- UI verification: `npm run verify:ui` (runs `scripts/verify-citycut.mjs`: Chromium at 1440x900, asserts UI invariants, writes screenshots to /workspace, exits non-zero on failure)
- Data builds: `npm run build:pt`, `npm run build:enrichment`

## Scope

- Desktop only. No phone or mobile layout work, and no phone screenshots.
- Laser cutting and physical model export are out of scope. Downloads are PNG, Rhino `.3dm`, and Illustrator `.ai`.

## Code rules

- No code comments. No narration, no leftover or commented-out code, no agent dialogue.
- No stray hex or `rgb(` in app TypeScript. Fills go in `src/colours.css`, lines in `src/drawing-style.css`. Update THEME.md when you add a variable. Keep `src/lib/colours.test.ts` green.
- Colours come from tokens only: fills in `src/colours.css`, lines in `src/drawing-style.css`, chrome in `src/theme.css`.
- No text outlines, text strokes, or icon glow. Keep `src/lib/noTextOutline.test.ts` green.
- Use source-of-truth data and keep attribution when you add a data source.
- When an external endpoint fails, abort or fall back. Never invent data.

## Before and after changes

- Before bigger changes (a new data source, a multi-file feature), run pstack blast-radius to find what else could break. Skip it for small fixes.
- On every PR run `npm run typecheck`, `npm test`, and `npm run build`, then `npm run verify:ui` (1440x900 desktop).
- For UI changes, attach the verify:ui desktop screenshots to the PR. Docs-only PRs need no screenshots.
- The verify skill is `.claude/skills/verify-citycut/SKILL.md` (`verify-citycut`). Use it before reporting or asking to merge any UI change.

## PRs and branches

- One feature per PR.
- Never merge without Kelvin's explicit go.
- Only one tool, Cursor or Claude Code, works on a branch at a time. Do not commit, push, or switch branches in a checkout another agent is using.
- On handoff, fill in `.github/HANDOFF.md` in the PR description.

## Secrets

- Never print, log, or commit secrets or tokens. Do not read or edit `.env*` files.
