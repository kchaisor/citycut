import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const OUT_DIR = "/opt/cursor/artifacts";
mkdirSync(OUT_DIR, { recursive: true });

const CANONICAL =
  process.env.PREVIEW_URL ??
  "https://citycut-git-cursor-rozelle-site-layer-kchai.vercel.app/?lat=-33.8677&lon=151.1832&km=1";

const WIDTHS = [1280, 1440];

async function waitForBuildDone(page) {
  await page.waitForFunction(
    () => {
      const pill = document.querySelector(".model .loading-hud-pill.is-model-bridge");
      if (!pill) return true;
      const opacity = Number(getComputedStyle(pill).opacity);
      return getComputedStyle(pill).display === "none" || opacity <= 0.05;
    },
    { timeout: 360_000 },
  );
}

async function captureWidth(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  page.setDefaultTimeout(360_000);
  await page.goto(CANONICAL, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator("button.create-fab").click({ timeout: 60_000 });
  await page.waitForSelector(".model", { timeout: 360_000 });
  await waitForBuildDone(page);
  await page.waitForFunction(
    () => {
      const left = document.querySelector(".model .top-bar-left");
      return left != null && Number(getComputedStyle(left).opacity) > 0.9;
    },
    { timeout: 120_000 },
  );
  await page.waitForTimeout(1500);
  const primaryOn = await page.evaluate(() => {
    const root = document.querySelector(".model");
    const display = root?.getAttribute("data-view-tab");
    if (display !== "3d") return false;
    const toggle = document.querySelector('.left-outliner input[type="checkbox"][data-layer="primary"]');
    if (toggle instanceof HTMLInputElement) return toggle.checked;
    return true;
  });
  const shot3d = path.join(OUT_DIR, `rozelle-pr227-3d-primary-${width}.png`);
  await page.screenshot({ path: shot3d, fullPage: false });
  await page.evaluate(() => {
    const select = document.querySelector(".model .topbar-view-select");
    if (select instanceof HTMLSelectElement) {
      select.value = "drawing";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const tab = Array.from(document.querySelectorAll(".model .mode-btn[role='tab']")).find((el) =>
      /drawing/i.test(el.textContent ?? ""),
    );
    if (tab instanceof HTMLButtonElement) tab.click();
  });
  await page.waitForSelector("svg.plan", { timeout: 120_000 });
  await page.waitForTimeout(1200);
  const shotDrawing = path.join(OUT_DIR, `rozelle-pr227-drawing-${width}.png`);
  await page.screenshot({ path: shotDrawing, fullPage: false });
  await page.close();
  return { shot3d, shotDrawing, primaryOn };
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const shots = [];
for (const width of WIDTHS) {
  shots.push({ width, ...(await captureWidth(browser, width)) });
}
await browser.close();
console.log(JSON.stringify({ canonical: CANONICAL, shots }, null, 2));