# PR handoff

- **What changed:** Merged `origin/main` (`76826f6`, top-bar fit #228 + inspect pick). Designbot follow-ups: wind core `#1e40af` @ ≤0.9α; viewport-area seed budget, far-slot priority, 32px min far trail; verify wind windows scoped to `x≥400, y≥300`. ≤1280: env console inset ≥16px from compass; `40+` legend hides `km/h` below 1360. Top bar: main fit + `topBarGroups` e2e (1024–1440, scrollWidth vs clientWidth).
- **Why:** Top bar collision at 1280×800; trail contrast/density; analysis/compass gap.
- **How verified:** `5446557` — `npm run typecheck`, `npm run build`, `npm test`, `npm run verify:ui` **60/60**; `topBarGroups` e2e; `GROUND_WIND_RUNS=5 node scripts/ground-wind-se-loop.mjs` **allPass=true** (SE band/quarter ≥0.35×; live reference still `23d0e68` 5/5). Vercel shots at 1280 & 1440 in PR body.
- **Preview:** https://citycut-git-claude-ground-wind-v2-kchai.vercel.app/?lat=-37.983826&lon=145.21555&km=1&debug=wind
- **Next step:** needs Kelvin's go to merge (no force-push, no merge from agent).