/**
 * QA: selected building at 50% opacity after height-edit selection (3D tab).
 * npx vite-node scripts/qa-building-selection-3d-click.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const outPath = `${outDir}/qa-melbourne-building-selection-3d-click.png`;

const url = "http://127.0.0.1:4173/citycut/?qa=1&lat=-37.8136&lon=144.9631&km=0.5";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (err) => console.error("pageerror", err.message));

await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
await page.getByRole("button", { name: "Create model" }).click({ timeout: 60_000 });
await page.locator(".viewport-hint").waitFor({ timeout: 180_000 });
await page.waitForTimeout(2500);

for (let i = 0; i < 3; i++) await page.keyboard.press("Escape");
await page.waitForTimeout(400);

await page.waitForFunction(() => window.__citycutQa?.setCamera != null, null, { timeout: 60_000 });
await page.evaluate(() => {
  window.__citycutQa?.setCamera({
    eye: { x: 220, y: 200, z: 180 },
    target: { x: 10, y: 18, z: -5 },
  });
});
await page.waitForTimeout(800);

await page.waitForFunction(() => window.__citycutQaModel != null, null, { timeout: 60_000 });

const canvas = page.locator("canvas.scene-canvas");
const box = await canvas.boundingBox().catch(() => null);
let picked = false;
if (box) {
  for (const [px, py] of [
    [0.52, 0.48],
    [0.55, 0.45],
    [0.48, 0.52],
  ]) {
    await page.mouse.click(box.x + box.width * px, box.y + box.height * py);
    await page.waitForTimeout(600);
    if (await page.getByText("Building height").isVisible().catch(() => false)) {
      picked = true;
      break;
    }
  }
}

if (!picked) {
  const id = await page.evaluate(() => window.__citycutQaModel?.openMidriseHeightEdit() ?? null);
  if (id == null) throw new Error("Could not pick a building in 3D");
  console.warn("Canvas pick missed in headless run; used QA bridge (same selection path as height edit).");
  await page.waitForTimeout(700);
}

await page.screenshot({ path: outPath, fullPage: false });
console.log("Saved", outPath);
await browser.close();
