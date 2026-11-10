#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };
const PREVIEW_URL =
  process.env.CITYCUT_PREVIEW_URL ??
  "https://citycut-git-feat-section-knife-kchai.vercel.app/?lat=-37.8045&lon=145.1065&km=1&label=Mont+Albert+North";
const OUT_DIR = process.env.CITYCUT_ARTIFACTS_DIR ?? path.join(process.cwd(), "workspace-artifacts");

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });

  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.addInitScript(() => {
      window.__citycutMinSilentLoadMs = 550;
    });
    await page.goto(PREVIEW_URL, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForSelector("button.create-fab", { timeout: 45000 });
    await page.click("button.create-fab");
    await page.waitForSelector(".model canvas", { timeout: 120000 });
    await page.waitForTimeout(14000);
    await page.locator(".proj-btn.studio-submode-pill", { hasText: "Isometric" }).click();
    await page.waitForTimeout(800);
    const contoursRow = page.locator(".model .left-outliner .layer-row", { hasText: /^Contours/ }).first();
    if ((await contoursRow.count()) > 0) {
      const checked = await contoursRow.evaluate((el) => el.querySelector("input[type=checkbox]")?.checked);
      if (!checked) await contoursRow.click();
    }
    await page.locator(".section-knife-toggle").click();
    await page.waitForSelector(".section-knife-elevation", { timeout: 20000 });
    await page.waitForTimeout(1800);
    const header = await page.locator(".model .top-bar-left").textContent();
    if (!header?.includes("Mont Albert North")) {
      throw new Error(`Expected Mont Albert North in header, got: ${header?.slice(0, 80)}`);
    }
    const shot3d = path.join(OUT_DIR, "section-knife-mont-albert-north-3d-1440x900.png");
    const shotHud = path.join(OUT_DIR, "section-knife-mont-albert-north-hud-1440x900.png");
    await page.screenshot({ path: shot3d, fullPage: false });
    await page.locator(".section-knife-elevation").screenshot({ path: shotHud });
    console.log(`[ARTIFACT] ${shot3d}`);
    console.log(`[ARTIFACT] ${shotHud}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
