/**
 * QA screenshots for the six-item PR. Run after `npm run build`.
 * npx vite-node scripts/qa-six-items-screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const base = "http://127.0.0.1:4173/citycut/";
const view = { width: 1280, height: 800 };

function diffPixels(pathA, pathB) {
  const a = PNG.sync.read(readFileSync(pathA));
  const b = PNG.sync.read(readFileSync(pathB));
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) {
      changed += 1;
    }
  }
  return changed;
}

async function closeChrome(page) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

await new Promise((resolve) => setTimeout(resolve, 1500));

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: view, reducedMotion: "no-preference" });
const page = await context.newPage();
page.on("pageerror", (err) => console.error("pageerror", err.message));

const modelUrl = `${base}?qa=1&view=persp&solar=path&heliodon=2&lat=-37.8155&lon=145.1050&km=1&siteLat=-37.8155&siteLon=145.1050&label=20%20Hamilton%20St%2C%20Mont%20Albert`;

try {
  await page.goto(`${base}?qa=1`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByPlaceholder("Search a city, address, or place");
  await search.fill("20 Hamilton St, Mont Albert");
  await page.waitForTimeout(1500);
  const result = page.locator("#place-results button").first();
  if (await result.isVisible().catch(() => false)) await result.click();
  else await search.press("Enter");
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${outDir}/2-search-map-site.png`, fullPage: false });

  await page.goto(modelUrl, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("button", { name: "Create model" }).click({ timeout: 60_000 });
  await page.waitForTimeout(95_000);
  await page.locator(".viewport-hint").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  await closeChrome(page);

  await page.evaluate(() => {
    window.__citycutQa?.setCamera({
      eye: { x: 300, y: 240, z: 160 },
      target: { x: 35, y: 40, z: -25 },
    });
  });
  await page.waitForTimeout(800);
  await page.waitForFunction(() => window.__citycutQaModel != null, null, { timeout: 60_000 });
  const pickedId = await page.evaluate(() => window.__citycutQaModel?.openMidriseHeightEdit() ?? null);
  if (pickedId == null) console.warn("QA mid-rise height pick failed.");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/1-edit-selection.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  const readCam = async () => page.evaluate(() => window.__citycutQa?.getCamera?.() ?? null);
  const sunPath = page.getByLabel("Show sun path & compass");

  await closeChrome(page);
  await page.getByRole("button", { name: "Solar", exact: true }).click();
  if (await sunPath.isChecked()) await sunPath.uncheck();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Solar", exact: true }).click();

  await page.screenshot({ path: `${outDir}/3-solar-same-camera-before.png`, fullPage: false });
  const beforeCam = await readCam();
  await page.getByRole("button", { name: "Solar", exact: true }).click();
  await sunPath.check();
  await page.waitForTimeout(800);
  const afterCam = await readCam();
  writeFileSync(
    `${outDir}/3-solar-camera-check.txt`,
    `before: ${JSON.stringify(beforeCam)}\nafter: ${JSON.stringify(afterCam)}\npositionAndTargetEqual: ${
      beforeCam &&
      afterCam &&
      JSON.stringify(beforeCam.eye) === JSON.stringify(afterCam.eye) &&
      JSON.stringify(beforeCam.target) === JSON.stringify(afterCam.target)
    }\n`,
  );
  await page.getByRole("button", { name: "Solar", exact: true }).click();
  await page.screenshot({ path: `${outDir}/3-solar-same-camera-after.png`, fullPage: false });

  await closeChrome(page);
  await page.getByRole("button", { name: "Solar", exact: true }).click();
  if (!(await sunPath.isChecked())) await sunPath.check();
  await page.getByRole("button", { name: "Solar", exact: true }).click();
  await page.mouse.move(24, 24);
  await page.evaluate(() => window.__citycutQa?.frameHeliodon?.());
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${outDir}/4-sunpath-no-halo.png`, fullPage: false });

  await page.locator(".stage-attrib").screenshot({ path: `${outDir}/5-credits.png` });

  await closeChrome(page);
  await page.getByRole("button", { name: "Wind", exact: true }).click();
  const windEnable = page.locator(".wind-drawer input[type=checkbox]").first();
  if (!(await windEnable.isChecked())) await windEnable.check();
  await page.getByRole("button", { name: "Wind", exact: true }).click();
  await page.mouse.move(24, 24);
  await page.evaluate(() => {
    window.__citycutQa?.setCamera({
      eye: { x: 520, y: 620, z: 520 },
      target: { x: 0, y: 0, z: 0 },
    });
  });
  await page.waitForTimeout(1500);
  const windCanvas = page.locator(".viewport canvas");
  await windCanvas.screenshot({ path: `${outDir}/6-wind-arrows-t0.png` });
  await page.waitForTimeout(700);
  await windCanvas.screenshot({ path: `${outDir}/6-wind-arrows-t1.png` });
  const windDiff = diffPixels(`${outDir}/6-wind-arrows-t0.png`, `${outDir}/6-wind-arrows-t1.png`);
  writeFileSync(`${outDir}/6-wind-arrows-diff.txt`, `changedPixels: ${windDiff}\n`);
} finally {
  await browser.close();
}

console.log("QA screenshots written to", outDir);
