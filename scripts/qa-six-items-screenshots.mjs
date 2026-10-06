/**
 * QA screenshots for the six-item PR. Run after `npm run build`.
 * npx vite-node scripts/qa-six-items-screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const base = "http://127.0.0.1:4173/citycut-export/";
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

await new Promise((resolve) => setTimeout(resolve, 1500));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: view });
page.on("pageerror", (err) => console.error("pageerror", err.message));

try {
  // 2 — search map highlight
  await page.goto(`${base}?qa=1`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const search = page.getByPlaceholder("Search a city, address, or place");
  await search.fill("20 Hamilton St, Mont Albert");
  await page.waitForTimeout(1500);
  const result = page.locator("#place-results button").first();
  if (await result.isVisible().catch(() => false)) {
    await result.click();
  } else {
    await search.press("Enter");
  }
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${outDir}/2-search-map-site.png`, fullPage: false });

  // 1 — height edit (open model at Mont Albert)
  await page.goto(
    `${base}?qa=1&lat=-37.8155&lon=145.1050&km=1&siteLat=-37.8155&siteLon=145.1050&label=20%20Hamilton%20St%2C%20Mont%20Albert`,
    { waitUntil: "networkidle", timeout: 120_000 },
  );
  await page.getByRole("button", { name: "Create model" }).click({ timeout: 60_000 });
  await page.waitForTimeout(95_000);
  await page.locator(".viewport-hint").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    window.__citycutQa?.setCamera({
      eye: { x: 280, y: 220, z: 320 },
      target: { x: 0, y: 25, z: 0 },
    });
  });
  await page.waitForTimeout(500);
  const canvas = page.locator(".viewport canvas").first();
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.48);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/1-edit-selection.png`, fullPage: false });

  // 3 — solar same camera
  const readCam = async () =>
    page.evaluate(() => {
      const pose = window.__citycutQa?.getCamera?.();
      if (pose) return pose;
      return null;
    });
  await page.getByRole("button", { name: "Solar" }).click();
  await page.screenshot({ path: `${outDir}/3-solar-same-camera-before.png`, fullPage: false });
  const beforeCam = await readCam();
  await page.getByLabel("Show sun path & compass").check();
  await page.waitForTimeout(800);
  const afterCam = await readCam();
  writeFileSync(
    `${outDir}/3-solar-camera-check.txt`,
    `before: ${JSON.stringify(beforeCam)}\nafter: ${JSON.stringify(afterCam)}\nequal: ${JSON.stringify(beforeCam) === JSON.stringify(afterCam)}\n`,
  );
  await page.screenshot({ path: `${outDir}/3-solar-same-camera-after.png`, fullPage: false });

  // 4 — sun path labels
  await page.getByLabel("Show sun path & compass").check();
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.__citycutQa?.setCamera({
      eye: { x: 120, y: 180, z: 260 },
      target: { x: 0, y: 8, z: -20 },
    });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/4-sunpath-no-halo.png`, fullPage: false });

  // 5 — credits
  await page.locator(".stage-attrib").screenshot({ path: `${outDir}/5-credits.png` });

  // 6 — wind arrows
  await page.getByRole("button", { name: "Wind", exact: true }).click();
  const windEnable = page.locator(".wind-drawer input[type=checkbox]").first();
  if (!(await windEnable.isChecked())) await windEnable.check();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__citycutQa?.setCamera({
      eye: { x: 350, y: 280, z: 380 },
      target: { x: 0, y: 15, z: 0 },
    });
  });
  await page.screenshot({ path: `${outDir}/6-wind-arrows-t0.png`, fullPage: false });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/6-wind-arrows-t1.png`, fullPage: false });
  const windDiff = diffPixels(`${outDir}/6-wind-arrows-t0.png`, `${outDir}/6-wind-arrows-t1.png`);
  writeFileSync(`${outDir}/6-wind-arrows-diff.txt`, `changedPixels: ${windDiff}\n`);
} finally {
  await browser.close();
}

console.log("QA screenshots written to", outDir);
