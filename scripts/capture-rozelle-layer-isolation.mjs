import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT_DIR = "/opt/cursor/artifacts";
mkdirSync(OUT_DIR, { recursive: true });

const URL =
  process.env.PREVIEW_URL ??
  "http://127.0.0.1:4173/citycut/?lat=-33.8677&lon=151.1832&km=1";

async function waitForBuildDone(page) {
  await page.waitForFunction(
    () => {
      const pill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
      if (!pill) return true;
      return getComputedStyle(pill).display === "none" || Number(getComputedStyle(pill).opacity) <= 0.05;
    },
    { timeout: 360_000 },
  );
}

async function setOutlines(page, on) {
  const toggle = page.locator(".model .mini-flags label").filter({ hasText: /^Outlines$/ }).locator('input[type="checkbox"]');
  await toggle.setChecked(on, { force: true });
}

async function setContours3d(page, on) {
  const toggle = page.locator(".model .studio-layer-row").filter({ hasText: /^Contours/ }).locator('input[type="checkbox"]');
  await toggle.setChecked(on, { force: true });
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(360_000);
await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.locator("button.create-fab").click({ timeout: 60_000 });
await page.waitForSelector(".model", { timeout: 360_000 });
await waitForBuildDone(page);
await page.waitForTimeout(2000);

const shots = {};
await page.screenshot({ path: path.join(OUT_DIR, "rozelle-isolation-both-on-1440.png") });
shots.bothOn = path.join(OUT_DIR, "rozelle-isolation-both-on-1440.png");

await setContours3d(page, false);
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT_DIR, "rozelle-isolation-contours-off-1440.png") });
shots.contoursOff = path.join(OUT_DIR, "rozelle-isolation-contours-off-1440.png");

await setContours3d(page, true);
await setOutlines(page, false);
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT_DIR, "rozelle-isolation-outlines-off-1440.png") });
shots.outlinesOff = path.join(OUT_DIR, "rozelle-isolation-outlines-off-1440.png");

await setOutlines(page, true);
await setContours3d(page, false);
await setOutlines(page, false);
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT_DIR, "rozelle-isolation-both-off-1440.png") });
shots.bothOff = path.join(OUT_DIR, "rozelle-isolation-both-off-1440.png");

await browser.close();
console.log(JSON.stringify({ url: URL, shots }, null, 2));