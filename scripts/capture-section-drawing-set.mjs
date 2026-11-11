#!/usr/bin/env node
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };
const PREVIEW_URL =
  process.env.CITYCUT_PREVIEW_URL ??
  "http://127.0.0.1:4173/citycut/?lat=-37.8045&lon=145.1065&km=1&label=Mont+Albert+North";
const OUT_DIR = process.env.CITYCUT_ARTIFACTS_DIR ?? "/opt/cursor/artifacts";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
    const { buildSectionExport3dm } = await import(pathToFileURL(path.join(REPO_ROOT, "src/lib/sectionKnife/sectionExport.ts")).href);
    const planModel = await page.evaluate(() => window.__citycutQaModel?.exportPlanSnapshot?.());
    const pose = await page.evaluate(() => {
      const offset = Number(document.querySelector("[data-section-knife-offset-m]")?.getAttribute("data-section-knife-offset-m") ?? "0");
      const angle = Number(document.querySelector("[data-section-knife-angle-rad]")?.getAttribute("data-section-knife-angle-rad") ?? "0.55");
      return { offsetM: offset, angleRad: angle };
    });
    if (planModel) {
      const bytes = await buildSectionExport3dm(planModel, pose, {
        applyVerticalExaggeration: false,
        knife: { id: "knife-1", label: "Section Knife A", pose },
      });
      fs.writeFileSync(path.join(OUT_DIR, "section-knife-mont-albert-export.3dm"), Buffer.from(bytes));
    }
    const hud = page.locator(".section-knife-elevation");
    if ((await hud.count()) > 0) {
      await hud.screenshot({ path: path.join(OUT_DIR, "section-drawing-set-hud-1440x900.png") });
    }
    console.log(`[ARTIFACT] ${path.join(OUT_DIR, "section-drawing-set-plan-marker-1440x900.png")}`);
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
