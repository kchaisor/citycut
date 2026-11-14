# PR handoff

- **What changed:** Merged `origin/main` (top-bar fit #228, inspect pick, Card view). Wind: `#1e40af` core capped at 0.9 alpha; far-field seed budget scales with viewport area, far slots prioritized, 24px min trail in far band. ≤1280: env console inset for ≥16px gap to compass; 40+ legend drops `km/h` below 1360. E2e top bar audit 1024–1440 uses system Chrome.
- **Why:** Designbot review — top bar clip at 1280, contrast/far-field density, analysis/compass overlap.
- **How verified:** `npm run typecheck`, `npm run build`, `npm test` (incl. `groundWindPerspective`, `topBarGroups` e2e). Live 5/5 Cleeland wind at `23d0e68`; `npm run verify:ui` on follow-up commit (in progress).
- **Preview:** https://citycut-git-claude-ground-wind-v2-kchai.vercel.app/?lat=-37.983826&lon=145.21555&km=1&debug=wind
- **Next step:** needs Kelvin's go to merge.