import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ARTIFACTS = "/opt/cursor/artifacts";
const PREVIEW_BASE =
  process.env.CITYCUT_PREVIEW_URL ?? "https://citycut-git-cursor-topbar-fit-1280-kchai.vercel.app/citycut/";

const DANDENONG = {
  lat: -37.98382,
  lon: 145.21555,
  label: "40 Cleeland St, Dandenong VIC 3175",
  km: 1,
};

const WIDTHS = [1024, 1280, 1440];
const HEIGHT = 800;

fs.mkdirSync(ARTIFACTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(360_000);

const q = new URLSearchParams({
  lat: String(DANDENONG.lat),
  lon: String(DANDENONG.lon),
  label: DANDENONG.label,
  km: String(DANDENONG.km),
});

await page.goto(`${PREVIEW_BASE}?${q.toString()}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForSelector("button.create-fab", { timeout: 60_000 });
await page.locator("button.create-fab").click({ timeout: 30_000 });
await page.waitForSelector(".model", { timeout: 360_000 });
await page.waitForFunction(
  () => {
    const left = document.querySelector(".model .top-bar-left");
    return left && Number(getComputedStyle(left).opacity) > 0.9;
  },
  { timeout: 240_000 },
);
await page.waitForTimeout(1500);

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
  await page.waitForTimeout(400);
  await switchView("3D model");
  await page.waitForTimeout(250);
  await page.screenshot({
    path: path.join(ARTIFACTS, `vercel-topbar-3d-${width}.png`),
    clip: { x: 0, y: 0, width, height: 120 },
  });
  await switchView("Drawing");
  await page.waitForSelector("svg.plan", { timeout: 120_000 });
  await page.waitForTimeout(250);
  await page.screenshot({
    path: path.join(ARTIFACTS, `vercel-topbar-drawing-${width}.png`),
    clip: { x: 0, y: 0, width, height: 120 },
  });
}

await browser.close();
