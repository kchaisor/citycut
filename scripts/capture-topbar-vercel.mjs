import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ARTIFACTS = "/opt/cursor/artifacts";
const PREVIEW_BASE =
  process.env.CITYCUT_PREVIEW_URL ??
  "https://citycut-git-cursor-topbar-fit-1280-kchai.vercel.app/?_vercel_share=8znXr1hc6cH04uvSotxvn9CDv3LQvnZh";

const DANDENONG = {
  lat: -37.98382,
  lon: 145.21555,
  label: "40 Cleeland St, Dandenong VIC 3175",
  km: 1,
};

const WIDTHS = [1024, 1280, 1360, 1440];
const HEIGHT = 800;
const CROP_HEIGHT = 80;

fs.mkdirSync(ARTIFACTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(360_000);

const landingUrl = new URL(PREVIEW_BASE);
landingUrl.searchParams.set("lat", String(DANDENONG.lat));
landingUrl.searchParams.set("lon", String(DANDENONG.lon));
landingUrl.searchParams.set("label", DANDENONG.label);
landingUrl.searchParams.set("km", String(DANDENONG.km));

await page.goto(landingUrl.toString(), { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForSelector("button.create-fab", { timeout: 60_000 });
await page.locator("button.create-fab").click({ timeout: 30_000 });
await page.waitForSelector(".model", { timeout: 360_000 });
await page.waitForFunction(
  () => {
    const ready = document.querySelector(".model .top-bar-right .ready-text");
    const left = document.querySelector(".model .top-bar-left");
    if (!left || !ready) return false;
    const opacity = Number(getComputedStyle(left).opacity);
    const text = ready.textContent?.trim() ?? "";
    return opacity > 0.9 && /Ready/.test(text) && !/loading/i.test(text);
  },
  { timeout: 240_000 },
);
await page.waitForTimeout(800);

async function switchView(name) {
  const tab = page.getByRole("tab", { name });
  if (await tab.isVisible().catch(() => false)) {
    await tab.evaluate((el) => el.click());
    return;
  }
  const value = name === "3D model" ? "3d" : "drawing";
  await page.locator(".model .topbar-view-select").selectOption(value);
}

for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.waitForTimeout(500);
  await switchView("3D model");
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(ARTIFACTS, `vercel-topbar-3d-${width}.png`),
    clip: { x: 0, y: 0, width, height: CROP_HEIGHT },
  });
  await switchView("Drawing");
  await page.waitForSelector("svg.plan", { timeout: 120_000 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(ARTIFACTS, `vercel-topbar-drawing-${width}.png`),
    clip: { x: 0, y: 0, width, height: CROP_HEIGHT },
  });
  if (width === 1280) {
    await page.getByRole("button", { name: "Export" }).click();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: path.join(ARTIFACTS, `vercel-topbar-drawing-1280-export-menu.png`),
      clip: { x: 0, y: 0, width, height: CROP_HEIGHT + 120 },
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }
}

await browser.close();
