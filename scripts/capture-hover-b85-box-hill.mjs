import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseFromEnv = process.env.CITYCUT_PREVIEW_URL ?? process.env.VERIFY_BASE_URL;
const OUT = "/opt/cursor/artifacts";
const VIEWPORT = { width: 1440, height: 900 };
const BOX_HILL = { lat: "-37.8187756", lon: "145.1266505", km: "1" };

function modelUrl(base) {
  const u = new URL(base.endsWith("/") ? base : `${base}/`);
  u.searchParams.set("qa", "1");
  u.searchParams.set("qaHidePopover", "1");
  u.searchParams.set("lat", BOX_HILL.lat);
  u.searchParams.set("lon", BOX_HILL.lon);
  u.searchParams.set("km", BOX_HILL.km);
  return u.toString();
}

fs.mkdirSync(OUT, { recursive: true });

const port = process.env.VERIFY_PORT;
const baseUrl = baseFromEnv ?? (port ? `http://127.0.0.1:${port}/citycut/` : null);
if (!baseUrl) {
  throw new Error("Set CITYCUT_PREVIEW_URL, VERIFY_BASE_URL, or VERIFY_PORT");
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
await context.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "citycut.view",
      JSON.stringify({ projection: "perspective", corner: "sw", freeRotate: false }),
    );
    window.localStorage.setItem("citycut.view3d.whiteCard", "1");
  } catch {
    // ignore
  }
});
const page = await context.newPage();
await page.goto(modelUrl(baseUrl), { waitUntil: "domcontentloaded", timeout: 120000 });
await page.click("button.create-fab");
await page.waitForFunction(() => Boolean(window.__citycutQaModel?.findTallBuildingForLensQa), { timeout: 180000 });
await page.evaluate(async () => {
  await window.__citycutQaModel?.waitForComHeightsApplied?.(180000);
});
await page.waitForSelector(".model canvas", { timeout: 60000 });
await page.waitForTimeout(2000);

const target = await page.evaluate(() => window.__citycutQaModel?.findTallBuildingForLensQa?.() ?? null);
if (!target) throw new Error("No building hover target in Box Hill white-card view");

const canvasBox = await page.locator(".model canvas").boundingBox();
if (canvasBox) {
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.12, canvasBox.y + canvasBox.height * 0.92);
}
await page.waitForTimeout(300);
await page.mouse.move(target.clickX, target.clickY);
await page.waitForFunction(
  () => document.querySelector(".model canvas")?.dataset.buildingHoverHighlightActive === "1",
  { timeout: 12000 },
);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, "hover-b85-box-hill-white.png") });

const clip = await page.evaluate((id) => window.__citycutQaModel?.selectionScreenClip?.(id, 16) ?? null, target.id);
if (clip && clip.width > 40 && clip.height > 40) {
  const pad = 12;
  await page.screenshot({
    path: path.join(OUT, "hover-b85-box-hill-white-closeup.png"),
    clip: {
      x: Math.max(0, clip.x - pad),
      y: Math.max(0, clip.y - pad),
      width: Math.min(VIEWPORT.width, clip.width + pad * 2),
      height: Math.min(VIEWPORT.height, clip.height + pad * 2),
    },
  });
} else {
  await page.screenshot({
    path: path.join(OUT, "hover-b85-box-hill-white-closeup.png"),
    clip: {
      x: Math.max(0, target.clickX - 120),
      y: Math.max(0, target.clickY - 120),
      width: 240,
      height: 240,
    },
  });
}

await browser.close();
console.log(JSON.stringify({ out: OUT, targetId: target.id }, null, 2));
