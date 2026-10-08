/**
 * Browser timing: time-to-first-render and time-to-CoM-applied (East Melbourne 1 km).
 * Compare main (CoM off at create + view) vs PR (CoM on, prefetched at create).
 */
import { chromium } from "playwright";

const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";
const url = `${base}?lat=-37.8127&lon=144.98061&km=1&label=East+Melbourne+VIC&qa=1`;

async function oneRun(context, comOff) {
  const page = await context.newPage();
  const tNav = performance.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 300_000 });
  await page.waitForFunction(
    () => {
      const t = window.__citycutQaModel?.getHeightPerfTimings?.();
      return t?.firstRenderMs != null && t?.comAppliedMs != null;
    },
    null,
    { timeout: 120_000 },
  );
  const timings = await page.evaluate(() => window.__citycutQaModel?.getHeightPerfTimings?.());
  const result = {
    firstRenderMs: Math.round(timings?.firstRenderMs ?? 0),
    comAppliedMs: Math.round(timings?.comAppliedMs ?? 0),
    wallMs: Math.round(performance.now() - tNav),
  };
  await page.close();
  return result;
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

async function runSuite(comOff) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((off) => {
    window.localStorage.clear();
    if (off) window.localStorage.setItem("citycut.comBuildingHeights", "false");
  }, comOff);
  context.setDefaultTimeout(300_000);
  const cold = await oneRun(context, comOff);
  const warm = [];
  for (let i = 0; i < 3; i++) warm.push(await oneRun(context, comOff));
  await context.close();
  return { cold, warm };
}

const main = await runSuite(true);
const pr = await runSuite(false);

function mean(rows, key) {
  return Math.round(rows.reduce((a, r) => a + r[key], 0) / rows.length);
}

await browser.close();

console.log(
  JSON.stringify(
    {
      cold: { main: main.cold, pr: pr.cold },
      warmMean3: {
        main: {
          firstRenderMs: mean(main.warm, "firstRenderMs"),
          comAppliedMs: mean(main.warm, "comAppliedMs"),
        },
        pr: {
          firstRenderMs: mean(pr.warm, "firstRenderMs"),
          comAppliedMs: mean(pr.warm, "comAppliedMs"),
        },
      },
      warmRuns: { main: main.warm, pr: pr.warm },
      deltaWarmFirstRenderMs: mean(pr.warm, "firstRenderMs") - mean(main.warm, "firstRenderMs"),
    },
    null,
    2,
  ),
);
