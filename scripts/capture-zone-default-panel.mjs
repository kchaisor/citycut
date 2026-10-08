import { chromium } from "playwright";
import fs from "node:fs";

const out = process.argv[2] ?? "/opt/cursor/artifacts/zone-default-panel.png";
const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";
const url = `${base}?lat=-37.8127&lon=144.98061&km=1&label=East+Melbourne+VIC&qa=1`;

const ARTIFACT_DIRS = ["/opt/cursor/artifacts", "/cursor/stores/self/artifacts"];
for (const dir of ARTIFACT_DIRS) fs.mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(300_000);

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 300_000 });
await page
  .waitForFunction(() => window.__citycutQaModel?.getHeightPerfTimings?.().comAppliedMs != null, null, {
    timeout: 120_000,
  })
  .catch(() => {});
await page.waitForTimeout(2000);

const picked = await page.evaluate(() => window.__citycutQaModel?.pickZoneDefaultPanelQa?.() ?? null);

await page.waitForTimeout(1500);
await page.screenshot({ path: out, fullPage: false });
for (const dir of ARTIFACT_DIRS) {
  if (dir !== "/opt/cursor/artifacts") {
    fs.copyFileSync(out, `${dir}/${out.split("/").pop()}`);
  }
}
await browser.close();
console.log(JSON.stringify({ out, picked, url }, null, 2));
