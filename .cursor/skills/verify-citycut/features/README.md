# CityCut Feature Verification Index

All invariants below are asserted automatically by `scripts/verify-citycut.mjs` (`npm run verify:ui`):

| Feature ID | Invariant Summary | Selector / Telemetry |
| --- | --- | --- |
| `hud-typography` | `Geist` + `Geist Mono` loaded & applied; zero serif fallback | `document.fonts`, `getComputedStyle(document.body).fontFamily` |
| `hud-surface-hierarchy` | `.right-inspector` & `.sidebar-panel.is-right` have `0px` border and no `#DBDBDB`/`#EBEBEB` inner bleed; Display outliner says `VIEW STYLE`; zero card overlap at `1440×900` | `.right-inspector`, `.sidebar-panel.is-right`, `.left-outliner` |
| `transition-beat-1` | Landing view renders `Create model` CTA and centered 2D selection frame | `button.create-fab`, `.map-wrap .frame` |
| `transition-beat-2` | Outer 2D map masked to `#EBEBEB` (`rgb(235, 235, 235)`), Landing chrome hidden (`opacity: 0`), dark `#141413` top progress pill visible, 2D square isolated | `.select.is-loading .frame`, `.loading-hud-pill` |
| `transition-beat-3` | 3D mounts top-down (`dataset.introPolar <= 0.10`, `dataset.introScale <= 0.05`, slab distance matched to 2D cut) and tilts + extrudes simultaneously (`0.2 < scale < 0.85`) while Studio HUD remains `opacity: 0` | `canvas[data-intro-scale][data-intro-polar]`, `.model[data-intro-hold="true"]` |
| `transition-beat-4` | Camera settles at final isometric perspective (`polar >= 0.95`), buildings reach `scale === 1.000`, and Studio HUD islands slide in to `opacity === "1"` | `.top-bar-left`, `.left-outliner`, `.right-inspector`, `.bottom-bar` |
| `analysis-direction-a` | Clicking `Analysis` hides `.left-outliner` (`0` visible left drawer) and opens the 2-row `.bottom-bar.env-console` cleanly | `.left-tool-rail`, `.left-outliner`, `.bottom-bar.env-console` |
