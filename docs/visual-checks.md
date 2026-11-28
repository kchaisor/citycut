# Visual regression (Playwright)

Pull requests to `main` run desktop screenshots of the Cleeland St 1 km cut (1440×900, SwiftShader WebGL on Linux CI):

1. Landing map (before **Create**)
2. 3D model (fixed camera, reduced motion, intro settled)
3. Drawing (site plan tab)

Baselines live in `tests/visual/cleeland.spec.ts-snapshots/`. CI compares with `toHaveScreenshot` (default `maxDiffPixelRatio` 0.02; 3D uses 0.06 because of WebGL noise). Any `console` error fails the job. On failure, download the **playwright-visual-diffs** artifact from the workflow run.

## Refresh baselines after an intentional visual change

Baselines must be generated on **Linux** (same as CI). Options:

1. **Same PR, cloud workflow** — Run the **CI** workflow via **workflow_dispatch** on your branch with **Update visual baselines** checked. Download the **visual-baselines** artifact and copy the PNGs into `tests/visual/cleeland.spec.ts-snapshots/`, then commit and push.

2. **Local (Linux or matching CI image)** — After `npm ci` and `npm run build`:

   ```bash
   npx playwright install --with-deps chromium
   npm run test:visual:update
   ```

   Commit the updated files under `tests/visual/cleeland.spec.ts-snapshots/`.

Do not refresh baselines for unrelated changes. Keep the three shots in sync with the thresholds documented in `playwright.config.ts` and `tests/visual/cleeland.spec.ts`.
## Screenshots on every PR

Each PR run saves the three full-window shots (landing map, 3D model, Drawing) whether the comparison passes or fails. A follow-up job publishes them to the `pr-screenshots` branch and keeps one comment on the PR up to date with the images inline and the pass or fail result. The `pr-screenshots` branch holds only the latest shots for each PR, is rewritten on every run, and has Vercel deploys turned off.
