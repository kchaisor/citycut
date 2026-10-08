/**
 * Oblique 3D QA for Freemasons Hospital — identical orbit for main (CoM off) vs PR (CoM on).
 * usage: node scripts/capture-freemasons-3d.mjs [out.png] [--com-off]
 */
import { chromium } from "playwright";
import fs from "node:fs";

const comOff = process.argv.includes("--com-off");
const out =
  process.argv.find((a) => a.endsWith(".png")) ??
  (comOff ? "/opt/cursor/artifacts/freemasons-3d-main.png" : "/opt/cursor/artifacts/freemasons-3d-pr.png");
const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";
const url = `${base}?lat=-37.8127&lon=144.98061&km=1&label=East+Melbourne+VIC&qa=1`;

const ARTIFACT_DIRS = ["/opt/cursor/artifacts", "/cursor/stores/self/artifacts"];
for (const dir of ARTIFACT_DIRS) fs.mkdirSync(dir, { recursive: true });

/** Shared orbit: low oblique (~15–25°) via left-drag orbit on the 3D canvas (right-drag pans). */
async function orbitFreemasonsView(page) {
  await page.getByRole("button", { name: "Buildings", exact: true }).click();
  const canvas = page.locator(".viewport canvas");
  await canvas.waitFor({ state: "visible" });
  const box = await canvas.boundingBox();
  if (!box) return;
  const cx = box.x + box.width * 0.52;
  const cy = box.y + box.height * 0.58;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(cx - 260, cy - 140, { steps: 32 });
  await page.mouse.up({ button: "left" });
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(cx + 60, cy - 90, { steps: 16 });
  await page.mouse.up({ button: "left" });
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -160);
    await page.waitForTimeout(200);
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript((off) => {
  if (off) window.localStorage.setItem("citycut.comBuildingHeights", "false");
  else window.localStorage.removeItem("citycut.comBuildingHeights");
}, comOff);

const page = await context.newPage();
page.setDefaultTimeout(300_000);

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 300_000 });

if (!comOff) {
  await page
    .waitForFunction(() => window.__citycutQaModel?.getHeightPerfTimings?.().comAppliedMs != null, null, {
      timeout: 120_000,
    })
    .catch(() => {});
  await page.waitForTimeout(1500);
} else {
  await page.waitForTimeout(6000);
}

const comToggle = page.getByRole("button", { name: /CoM 2023/i });
if (await comToggle.count()) {
  const wantOn = !comOff;
  const pressed = await comToggle.first().getAttribute("aria-pressed");
  if ((pressed === "true") !== wantOn) await comToggle.first().click();
  await page.waitForTimeout(comOff ? 800 : 2500);
}

await orbitFreemasonsView(page);

await page.evaluate(() => {
  const api = window.__citycutQaModel;
  if (!api?.selectHeightEditBuilding) return;
  api.selectHeightEditBuilding(551928359);
});
if (comOff) {
  await page.waitForFunction(
    () => {
      const text = document.querySelector(".building-detail-panel")?.textContent ?? "";
      return text.includes("Zone default") && /6\.0/.test(text);
    },
    null,
    { timeout: 60_000 },
  );
} else {
  await page.waitForFunction(
    () => {
      const text = document.querySelector(".building-detail-panel")?.textContent ?? "";
      return text.includes("City of Melbourne") && /2[0-9]\.\d/.test(text);
    },
    null,
    { timeout: 120_000 },
  );
}
await page.waitForTimeout(800);

await page.screenshot({ path: out, fullPage: false });
for (const dir of ARTIFACT_DIRS) {
  if (dir !== "/opt/cursor/artifacts") {
    fs.copyFileSync(out, `${dir}/${out.split("/").pop()}`);
  }
}

const freemasons = await page.evaluate(() => {
  const list = window.__citycutQaModel?.listBuildings?.() ?? [];
  return list.find((b) => b.id === 551928359) ?? null;
});

await browser.close();
console.log(JSON.stringify({ out, comOff, freemasonsHeightM: freemasons?.height, url }, null, 2));
