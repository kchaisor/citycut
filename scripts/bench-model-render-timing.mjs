/**
 * Mean of 3 warm runs: time to model chrome + landing colour tile frame (East Melbourne 1 km).
 */
import { chromium } from "playwright";

const SWIFT = [
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";
const url = `${base}?lat=-37.8127&lon=144.98061&km=1&qa=1`;

async function landingColourMs(page) {
  const t0 = performance.now();
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page
    .waitForFunction(() => window.__citycutCutColourStats?.layerRebuilds >= 1, undefined, {
      timeout: 120_000,
    })
    .catch(() => {});
  return Math.round(performance.now() - t0);
}

async function modelFirstRenderMs(page) {
  const t0 = performance.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 300_000 });
  await page.waitForFunction(
    () => {
      const t = window.__citycutQaModel?.getHeightPerfTimings?.();
      return t?.firstRenderMs != null;
    },
    null,
    { timeout: 120_000 },
  );
  const timings = await page.evaluate(() => window.__citycutQaModel?.getHeightPerfTimings?.());
  return {
    wallMs: Math.round(performance.now() - t0),
    firstRenderMs: Math.round(timings?.firstRenderMs ?? 0),
    comAppliedMs: Math.round(timings?.comAppliedMs ?? 0),
  };
}

const browser = await chromium.launch({ headless: true, args: SWIFT });

async function runSuite(comOff) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((off) => {
    window.localStorage.clear();
    if (off) window.localStorage.setItem("citycut.comBuildingHeights", "false");
  }, comOff);
  const landing = [];
  const model = [];
  for (let i = 0; i < 3; i++) {
    const page = await context.newPage();
    landing.push(await landingColourMs(page));
    await page.close();
    const page2 = await context.newPage();
    model.push(await modelFirstRenderMs(page2));
    await page2.close();
  }
  await context.close();
  return { landing, model };
}

const main = await runSuite(true);
const pr = await runSuite(false);

function mean(nums) {
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

await browser.close();

console.log(
  JSON.stringify(
    {
      landingColourMsMean3: { mainWfsLive: mean(main.landing), prEnrichmentTiles: mean(pr.landing) },
      modelFirstRenderMsMean3: {
        main: mean(main.model.map((r) => r.firstRenderMs)),
        pr: mean(pr.model.map((r) => r.firstRenderMs)),
      },
      modelWallMsMean3: {
        main: mean(main.model.map((r) => r.wallMs)),
        pr: mean(pr.model.map((r) => r.wallMs)),
      },
      runs: { main, pr },
    },
    null,
    2,
  ),
);
