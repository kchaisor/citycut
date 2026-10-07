/**
 * QA: drifting wind arrows — three canvas shots at Mont Albert (high oblique, full frame).
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const QUERY =
  "?lat=-37.8155&lon=145.1050&km=1&siteLat=-37.8155&siteLon=145.1050&qa=1";

/** Match PR #50 six-wind-arrows high oblique (~50°) framing the full 1 km square. */
const cameraPose = {
  eye: { x: 520, y: 620, z: 520 },
  target: { x: 0, y: 0, z: 0 },
};

function diffPngBuffers(a, b) {
  const imgA = PNG.sync.read(a);
  const imgB = PNG.sync.read(b);
  let changed = 0;
  const dataA = imgA.data;
  const dataB = imgB.data;
  for (let i = 0; i < dataA.length; i += 4) {
    if (
      dataA[i] !== dataB[i] ||
      dataA[i + 1] !== dataB[i + 1] ||
      dataA[i + 2] !== dataB[i + 2] ||
      dataA[i + 3] !== dataB[i + 3]
    ) {
      changed++;
    }
  }
  return { changedPixels: changed, totalPixels: dataA.length / 4 };
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(300_000);

await page.goto(`http://127.0.0.1:4173/citycut/${QUERY}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 300_000 });
await page.waitForTimeout(5000);

await page.getByRole("button", { name: "Wind", exact: true }).click();
await page.getByLabel("Wind on").check();
await page.locator(".wind-drawer select").selectOption("annual");
await page.waitForTimeout(16000);

await page.getByRole("button", { name: "Wind", exact: true }).click();
await page.keyboard.press("Escape");
await page.mouse.move(24, 24);
await page.waitForTimeout(400);

await page.waitForFunction(() => window.__citycutQa?.setCamera, null, { timeout: 60_000 });
await page.evaluate((p) => {
  window.__citycutQa?.setCamera({ eye: p.eye, target: p.target });
}, cameraPose);
await page.waitForTimeout(3000);
await page.waitForTimeout(8000);

const canvas = page.locator(".viewport canvas");
const shots = [];

async function capture(label, waitMs) {
  if (waitMs > 0) await page.waitForTimeout(waitMs);
  const path = `${outDir}/wind-drift-${label}.png`;
  const png = await canvas.screenshot();
  writeFileSync(path, png);
  const heads = await page.evaluate(() => window.__citycutQaWind?.getHeadPositionsM?.() ?? null);
  shots.push({ label, path, heads });
}

await capture("t0", 0);
await capture("t2", 2000);
await capture("t4", 2000);

const { changedPixels, totalPixels } = diffPngBuffers(
  readFileSync(shots[0].path),
  readFileSync(shots[1].path),
);

await browser.close();

const report = {
  changedPixelsT0T2: changedPixels,
  totalPixels,
  shots,
};
writeFileSync(`${outDir}/wind-drift-qa.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
