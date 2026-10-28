---
name: verify-citycut
description: Use when verifying CityCut UI, typography, Studio HUD layout, Site Analysis console, or the 4-beat 2D-to-3D transition before shipping or pushing a PR.
---

# CityCut Verification Skill (`verify-citycut`)

Run the end-to-end automated browser verification harness whenever you touch `src/floating.css`, `src/App.tsx`, `src/components/MapStage.tsx`, `src/components/ModelPage.tsx`, or `src/components/Scene3D.tsx`:

```bash
npm run verify:ui
```

## What `npm run verify:ui` Mechanically Verifies

1. **Typography & Studio HUD CSS Invariants (`1440×900 @2x`)**
   - `Geist` and `Geist Mono` web fonts are loaded and applied (`getComputedStyle(document.body).fontFamily` begins with `Geist`, never falling back to serif).
   - `.right-inspector` (`SITE INTELLIGENCE`) and `.sidebar-panel.is-right` have `0px` border and zero legacy `#DBDBDB` / `#EBEBEB` inner container fill bleed.
   - Left Display outliner title reads `VIEW STYLE`.
   - Zero bounding-box overlap among visible perimeter Studio HUD islands at `1440×900`.

2. **4-Beat 2D -> 3D Transition Invariants (with realistic simulated network fetch latency)**
   - **Beat 1 (Landing)**: Landing screen renders with `Create model` CTA and centered 2D selection square (`.map-wrap .frame`).
   - **Beat 2 (Isolation & Loading)**: While cut data is fetching, the outer 2D map outside `.frame` masks to `#EBEBEB` (`rgb(235, 235, 235)`), Landing search/dock chrome fades out (`opacity === "0"`), the dark `#141413` Studio progress pill (`.loading-hud-pill`) with `#FFF500` border and progress bar is visible at top-center, and the centered 2D selection square remains isolated.
   - **Beat 3 (Simultaneous Tilt + Extrude)**: When 3D WebGL geometry mounts, Frame 1 starts top-down (`polar <= 0.10`, `scale <= 0.05`, camera distance matched to the 2D cut square) and smoothly progresses through mid-tilt and mid-extrusion (`0.20 < scale < 0.85`, `0.15 < polar < 0.98`) while all Studio HUD panels remain hidden off-screen (`opacity === "0"`).
   - **Beat 4 (Settled + HUD Slide-In)**: Camera reaches final isometric perspective (`polar >= 0.95`), buildings reach `scale === 1.000`, and Top Bar, Left Outliner, Right `SITE INTELLIGENCE`, and Bottom Bar slide in from their respective edges to `opacity === "1"`.

3. **Site Analysis Direction A Invariant**
   - Clicking `Analysis` on the left tool rail completely hides the left outliner drawer (`0` visible left drawer on screen) and opens the 2-row bottom environmental console (`.bottom-bar.env-console`) with zero card overlap.

See [`features/README.md`](features/README.md) for the feature invariant index.
