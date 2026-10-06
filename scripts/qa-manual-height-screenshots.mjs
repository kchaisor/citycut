/**
 * QA before/after screenshots for manual building heights (CBD 0.6 km).
 * Run: npx vite-node scripts/qa-manual-height-screenshots.mjs
 * Requires dev server on :5173.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const url =
  "http://localhost:5173/citycut-export/?lat=-37.8136&lon=144.9631&km=0.6&label=CBD&view=persp";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });

await page.getByRole("button", { name: "Layers" }).click();
const treesToggle = page.getByRole("button", { name: "Trees", exact: true });
if (await treesToggle.getAttribute("aria-pressed") === "true") {
  await treesToggle.click();
}

await page.getByRole("button", { name: "Create model" }).click();
await page.waitForSelector(".scene-canvas", { timeout: 240_000 });

const canvas = page.locator(".scene-canvas");
await canvas.waitFor({ state: "visible" });

async function obliqueView() {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas box");
  const cx = box.x + box.width * 0.52;
  const cy = box.y + box.height * 0.48;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 180, cy - 120, { steps: 12 });
  await page.mouse.up();
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(800);
}

await obliqueView();
await page.screenshot({ path: `${outDir}/cbd-height-before.png` });

async function pickBuilding() {
  const box = await canvas.boundingBox();
  if (!box) return false;
  const points = [
    [0.48, 0.52],
    [0.55, 0.5],
    [0.42, 0.55],
    [0.58, 0.46],
  ];
  for (const [px, py] of points) {
    const x = box.x + box.width * px;
    const y = box.y + box.height * py;
    await page.mouse.click(x, y);
    await page.waitForTimeout(400);
    if (await page.locator(".building-height-popover").count()) return true;
  }
  return false;
}

const picked = await pickBuilding();
if (!picked) {
  console.warn("Could not open height popover; after shot may lack popover.");
}

const input = page.locator(".building-height-popover input[type='number']");
if (await input.count()) {
  await input.fill("120");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(2000);
}

await page.locator('button.rail-btn[aria-label="Buildings"]').click();
await page.waitForTimeout(600);
await page.getByText(/manual height/i).waitFor({ timeout: 10_000 }).catch(() => {});
await obliqueView();
await page.screenshot({ path: `${outDir}/cbd-height-after.png` });

console.log(
  JSON.stringify({
    before: `${outDir}/cbd-height-before.png`,
    after: `${outDir}/cbd-height-after.png`,
    popoverOpened: picked,
  }),
);

await browser.close();
