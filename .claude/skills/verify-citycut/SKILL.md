---
name: verify-citycut
description: >-
  Use when verifying CityCut UI, typography, Studio HUD layout, Site Analysis
  Direction A, or the 2-phase 2D-to-3D transition before reporting or merging any
  CityCut PR.
---
# Verify CityCut (`verify-citycut`)

Run this end-to-end Playwright verification harness before reporting or asking to merge any UI, layout, typography, 3D scene, or transition change in CityCut.

## 1. Launch & Run

Run the single verification command from the repo root:

```bash
npm run verify:ui
```

`scripts/verify-citycut.mjs` automatically starts an isolated Vite server on a dedicated port, drives headless Chromium (`1440×900` `@2x` desktop viewport with WebGL enabled), records proof artifacts under `/workspace/`, and tears down the server and browser cleanly on exit.

## 2. Doctor

Before debugging a failure, confirm:
- `/usr/bin/google-chrome` is available and WebGL initializes cleanly (`--enable-webgl --use-gl=angle --use-angle=swiftshader`).
- `npm run typecheck`, `npx vitest run src/lib/colours.test.ts src/lib/noTextOutline.test.ts`, and `npm test -- --run` pass.

## 3. Invariants Checked by `npm run verify:ui`

The harness exits non-zero if any invariant fails:

1. **Typography & CSS Invariants**
   - `Geist` and `Geist Mono` fonts are loaded and applied (`getComputedStyle(document.body).fontFamily` begins with `Geist`, never falling back to a serif font).
   - Left `Display` outliner top section header reads `VIEW STYLE`, lists per-use building rows (`Residential`, `Commercial`, etc.), and includes a `Reset colours` button in `SCENE LAYERS` (in both `3D model` and `Drawing`) that restores default layer/use colours after an edit.
   - Right `SITE INTELLIGENCE` panel (`.right-inspector` and `.sidebar-panel.is-right`) has `0px` outer/inner border and uniform `var(--bg-card)` surface with zero `#DBDBDB` (`rgb(219, 219, 219)`) or `rgb(235, 235, 235)` inner fill bleed.
   - Zero bounding-box overlap between floating Studio HUD islands at `1440×900`.

2. **2-Phase `Create model` 2D → 3D Transition Invariants**
   - **Phase A (Silent Background Load & WebGL Pre-Warm):** When clicking `Create model`, nothing on the 2D selection screen fades or changes while network requests and 3D WebGL compilation/pre-warm (`3` top-down frames) complete behind the scenes (`outerAlpha === 0`, `.omnibox-stack` and `.bottom-workbench` remain at `opacity: 1`, and no top progress bar is shown yet).
   - **Phase B (Synchronised `0% → 100%` Fake Transition):** Starts the instant `citycut:intro-webgl-ready` fires (`0` blank frames). Over `2.1s`, one single clock (`progress = clamp(elapsedSec / 2.1, 0, 1)`) drives:
     - Top `.loading-hud-pill.is-model-bridge` progress bar smoothly and monotonically from `0%` to `100%` (`>= 10` intermediate samples, max step `<= 15%`).
     - `.select.is-handoff-underlay` opacity smoothly from `1.0` down to `0.0` in lockstep with `1 - progress` (`maxSyncDrift <= 0.06`).
     - Camera tilt/orbit from top-down 2D plan (`polar = 0.005`) to 3D perspective (`polar >= 0.95`), forcing `projection = "perspective"` even if `localStorage` previously stored `"iso"` or `"plan"`.
     - Center-outward 24-bucket building extrusion wave (`beat3a`) followed by 16-bucket bouncy tree pop-up with 16% spring overshoot (`beat3b`), settling to `scale.y = 1.000` at `100%` (`beat4`).

3. **Site Analysis Direction A & Drawing Shadow Isolation Invariants**
   - Clicking `Analysis` on the left rail hides `.left-outliner` completely (`0` visible left drawers), expands `.bottom-bar.env-console` into the 2-row Contextual Environmental Console without horizontal overflow, places `Reset view` in `.top-bar-center`, and shows `3D Sun Dome` in 3D view (`9–3pm Plan Fan` in Drawing).
   - Selecting buildings in `Drawing -> Site plan` isolates 9–3pm sun-study shadows strictly to the selected yellow buildings.

## 4. Evidence Artifacts

Proof screenshots and transition contact sheets are written to `/workspace/` (`pr164-v11-live-transition.mp4`, `pr164-v11-transition-contact-sheet.png`, `pr164-v11-display-reset-colours.png`) and preserved after teardown so they can be inspected with `Read` and shared in PR reports.
