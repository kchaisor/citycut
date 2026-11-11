#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };
const PREVIEW_URL =
  process.env.CITYCUT_PREVIEW_URL ??
  "http://127.0.0.1:4173/citycut/?lat=-37.8045&lon=145.1065&km=1&label=Mont+Albert+North";
const OUT_DIR = process.env.CITYCUT_ARTIFACTS_DIR ?? "/opt/cursor/artifacts";
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
    await page.goto(PREVIEW_URL, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForSelector("button.create-fab", { timeout: 60000 });
    await page.click("button.create-fab");
    await page.waitForSelector(".model canvas", { timeout: 120000 });
    await page.waitForTimeout(12000);
    await page.locator(".section-knife-toggle").click();
    await page.waitForTimeout(1200);
    await page.locator(".mode-btn", { hasText: "Drawing" }).click();
    await page.waitForSelector("[data-section-knife-plan-markers='1']", { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(OUT_DIR, "section-drawing-set-plan-marker-1440x900.png"),
      fullPage: false,
    });
    const endCrops = await page.evaluate(() => {
      const pick = (attr) => {
        const label = document.querySelector(`[data-section-knife-marker-end-label="${attr}"]`);
        const g = label?.closest("[data-section-knife-marker-id]");
        const bubble = g?.querySelector(".section-knife-marker-bubble");
        if (!bubble) return null;
        const br = bubble.getBoundingClientRect();
        const cx = br.left + br.width / 2;
        const cy = br.top + br.height / 2;
        return { x: Math.max(0, cx - 150), y: Math.max(0, cy - 150), width: 300, height: 300 };
      };
      return { a: pick("A"), aprime: pick("Aprime") };
    });
    if (endCrops.a) {
      await page.screenshot({
        path: path.join(OUT_DIR, "section-drawing-set-plan-marker-end-a-300x300.png"),
        clip: endCrops.a,
      });
    }
    if (endCrops.aprime) {
      await page.screenshot({
        path: path.join(OUT_DIR, "section-drawing-set-plan-marker-end-aprime-300x300.png"),
        clip: endCrops.aprime,
      });
    }
    await page.locator(".mode-btn", { hasText: "3D model" }).click();
    await page.waitForTimeout(600);
    await page.locator(".section-knife-align-edge").click();
    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(OUT_DIR, "section-drawing-set-panel-1440x900.png"),
      fullPage: false,
    });
    const audit = await page.evaluate(() => window.__citycutSectionExportAudit?.());
    if (!audit?.svg) throw new Error("section export svg missing from QA bridge");
    const svgPath = path.join(OUT_DIR, "section-knife-mont-albert-export.svg");
    fs.writeFileSync(svgPath, audit.svg);
    page.on("download", async (download) => {
      const name = download.suggestedFilename();
      const target =
        name.endsWith(".3dm") ? path.join(OUT_DIR, "section-knife-mont-albert-export.3dm") : path.join(OUT_DIR, name);
      await download.saveAs(target);
    });
    await page.locator("[data-section-knife-export]").click();
    await page.waitForTimeout(1500);
    const hud = page.locator(".section-knife-elevation");
    if ((await hud.count()) > 0) {
      await hud.screenshot({ path: path.join(OUT_DIR, "section-drawing-set-hud-1440x900.png") });
    }
    console.log(`[ARTIFACT] ${path.join(OUT_DIR, "section-drawing-set-plan-marker-1440x900.png")}`);
    console.log(`[ARTIFACT] ${path.join(OUT_DIR, "section-drawing-set-plan-marker-end-a-300x300.png")}`);
    console.log(`[ARTIFACT] ${path.join(OUT_DIR, "section-drawing-set-plan-marker-end-aprime-300x300.png")}`);
    console.log(`[ARTIFACT] ${path.join(OUT_DIR, "section-drawing-set-panel-1440x900.png")}`);
    console.log(`[ARTIFACT] ${svgPath}`);
    console.log(`[ARTIFACT] ${path.join(OUT_DIR, "section-knife-mont-albert-export.3dm")}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
