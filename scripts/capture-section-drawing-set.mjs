#!/usr/bin/env node
import { chromium } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };
const PREVIEW_URL =
  process.env.CITYCUT_PREVIEW_URL ??
  "http://127.0.0.1:4173/citycut/?lat=-37.8045&lon=145.1065&km=1&label=Mont+Albert+North";
const OUT_DIR = process.env.CITYCUT_ARTIFACTS_DIR ?? "/opt/cursor/artifacts";

function cropAroundBubble(label) {
  return (page) =>
    page.evaluate((attr) => {
      const bubble = document
        .querySelector(`[data-section-knife-marker-end-label="${attr}"]`)
        ?.parentElement?.querySelector(".section-knife-marker-bubble");
      const labelEl = document.querySelector(`[data-section-knife-marker-end-label="${attr}"]`);
      if (!bubble) return { clip: null, sizes: null };
      const br = bubble.getBoundingClientRect();
      const lr = labelEl?.getBoundingClientRect();
      const arrow = document
        .querySelector(`[data-section-knife-marker-end-label="${attr}"]`)
        ?.parentElement?.querySelector(".section-knife-marker-arrow");
      const ar = arrow?.getBoundingClientRect();
      const cx = br.left + br.width / 2;
      const cy = br.top + br.height / 2;
      return {
        clip: {
          x: Math.max(0, Math.floor(cx - 150)),
          y: Math.max(0, Math.floor(cy - 150)),
          width: 300,
          height: 300,
        },
        center: { x: cx, y: cy },
        sizes: {
          bubbleDiam: br.width,
          labelH: lr?.height ?? 0,
          arrowMax: ar ? Math.max(ar.width, ar.height) : 0,
          text: labelEl?.textContent?.trim() ?? "",
        },
      };
    }, label);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
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
    await page.waitForSelector('[data-section-knife-marker-end-label="A"]', { timeout: 30000 });
    await page.waitForFunction(
      () => {
        const b = document
          .querySelector('[data-section-knife-marker-end-label="A"]')
          ?.parentElement?.querySelector(".section-knife-marker-bubble");
        return b && b.getBoundingClientRect().width >= 16;
      },
      { timeout: 45000 },
    );
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: path.join(OUT_DIR, "section-drawing-set-plan-marker-1440x900.png"),
      fullPage: false,
    });
    const endA = await cropAroundBubble("A")(page);
    const endAprime = await cropAroundBubble("Aprime")(page);
    const cropPathA = path.join(OUT_DIR, "section-drawing-set-plan-marker-end-a-300x300.png");
    const cropPathAprime = path.join(OUT_DIR, "section-drawing-set-plan-marker-end-aprime-300x300.png");
    if (endA.clip) await page.screenshot({ path: cropPathA, clip: endA.clip });
    if (endAprime.clip) await page.screenshot({ path: cropPathAprime, clip: endAprime.clip });
    const hashA = endA.clip ? crypto.createHash("md5").update(fs.readFileSync(cropPathA)).digest("hex") : "";
    const hashAprime = endAprime.clip ? crypto.createHash("md5").update(fs.readFileSync(cropPathAprime)).digest("hex") : "";
    const centerDist =
      endA.center && endAprime.center
        ? Math.hypot(endA.center.x - endAprime.center.x, endA.center.y - endAprime.center.y)
        : 0;
    console.log(
      `[MEASURE] A: d=${endA.sizes?.bubbleDiam?.toFixed(1)} textH=${endA.sizes?.labelH?.toFixed(1)} arrow=${endA.sizes?.arrowMax?.toFixed(1)} center=(${endA.center?.x?.toFixed(0)},${endA.center?.y?.toFixed(0)})`,
    );
    console.log(
      `[MEASURE] A′: d=${endAprime.sizes?.bubbleDiam?.toFixed(1)} textH=${endAprime.sizes?.labelH?.toFixed(1)} arrow=${endAprime.sizes?.arrowMax?.toFixed(1)} center=(${endAprime.center?.x?.toFixed(0)},${endAprime.center?.y?.toFixed(0)}) dist=${centerDist.toFixed(0)} md5A=${hashA.slice(0, 8)} md5Aprime=${hashAprime.slice(0, 8)}`,
    );
    if (!hashA || !hashAprime || hashA === hashAprime) {
      throw new Error(`end crop hashes must differ (A=${hashA}, Aprime=${hashAprime})`);
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
    console.log(`[ARTIFACT] ${cropPathA}`);
    console.log(`[ARTIFACT] ${cropPathAprime}`);
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
