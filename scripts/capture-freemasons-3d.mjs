/**
 * Deterministic in-app oblique capture for Freemasons (551928359).
 * Sequence: select → zoom at projected point → stepped left-drag orbit up.
 * Replay is identical on main (CoM off) and PR (CoM on).
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BUILDING_ID = 551928359;
const VIEW_W = 1440;
const VIEW_H = 900;
const TARGET_AREA_FRACTION = 0.25;

/** Recorded event sequence (calibrated for VIEW_W×VIEW_H). */
const RECORDED = {
  maxZoomTicks: 28,
  wheelDeltaY: -90,
  preZoomUntilFramed: true,
  orbitDrags: [
    { dx: 0, dy: -14, steps: 12 },
    { dx: 0, dy: -12, steps: 10 },
    { dx: 0, dy: -10, steps: 10 },
    { dx: -8, dy: -10, steps: 8 },
    { dx: 0, dy: -8, steps: 8 },
  ],
};

const comOff = process.argv.includes("--com-off");
const out =
  process.argv.find((a) => a.endsWith(".png")) ??
  (comOff ? "/opt/cursor/artifacts/freemasons-3d-main.png" : "/opt/cursor/artifacts/freemasons-3d-pr.png");
const base = process.env.PREVIEW_URL ?? "http://127.0.0.1:4173/citycut/";
const url = `${base}?lat=-37.8127&lon=144.98061&km=1&label=East+Melbourne+VIC&qa=1`;

const ARTIFACT_DIRS = ["/opt/cursor/artifacts", "/cursor/stores/self/artifacts"];
for (const dir of ARTIFACT_DIRS) fs.mkdirSync(dir, { recursive: true });

function copyOut(path) {
  const name = path.split("/").pop();
  for (const dir of ARTIFACT_DIRS) {
    if (dir !== "/opt/cursor/artifacts") fs.copyFileSync(path, `${dir}/${name}`);
  }
}

async function screenAnchor(page, buildingId) {
  return page.evaluate((id) => {
    const clip = window.__citycutQaModel?.selectionScreenClip?.(id, 20);
    if (!clip) return null;
    return {
      cx: clip.x + clip.width / 2,
      cy: clip.y + clip.height / 2,
      area: clip.width * clip.height,
      clip,
    };
  }, buildingId);
}

async function assertFreemasonsVisible(page) {
  return page.evaluate(() => {
    const panel = document.querySelector(".building-detail-panel")?.textContent ?? "";
    return panel.includes("Freemasons");
  });
}

async function replayObliqueSequence(page, buildingId, comOffRun) {
  await page.locator(".viewport canvas").waitFor({ state: "visible" });
  await page.evaluate((id) => {
    window.__citycutQaModel?.selectHeightEditBuilding?.(id);
    window.__citycutQaModel?.frameSelectionBuilding?.(id, "oblique");
  }, buildingId);
  await page.waitForTimeout(1200);

  const canvasBox = await page.locator(".viewport canvas").boundingBox();
  const orbitCx = canvasBox.x + canvasBox.width * 0.46;
  const orbitCy = canvasBox.y + canvasBox.height * 0.52;

  if (RECORDED.preZoomUntilFramed) {
    for (let i = 0; i < 10; i++) {
      if (await assertFreemasonsVisible(page)) break;
      const anchor = await screenAnchor(page, buildingId);
      const canvas = await page.locator(".viewport canvas").boundingBox();
      const cx = anchor?.cx ?? canvas.x + canvas.width * 0.5;
      const cy = anchor?.cy ?? canvas.y + canvas.height * 0.5;
      await page.mouse.move(cx, cy);
      await page.mouse.wheel(0, RECORDED.wheelDeltaY);
      await page.waitForTimeout(160);
    }
  }

  const minClipHeight = comOffRun ? 72 : 48;
  for (let tick = 0; tick < RECORDED.maxZoomTicks; tick++) {
    const anchor = await screenAnchor(page, buildingId);
    if (!anchor) break;
    const fraction = anchor.area / (VIEW_W * VIEW_H);
    if (fraction >= TARGET_AREA_FRACTION && anchor.clip.height >= minClipHeight) break;
    await page.mouse.move(anchor.cx, anchor.cy);
    await page.mouse.wheel(0, RECORDED.wheelDeltaY);
    await page.waitForTimeout(160);
  }

  for (const drag of RECORDED.orbitDrags) {
    await page.mouse.move(orbitCx, orbitCy);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(orbitCx + drag.dx, orbitCy + drag.dy, { steps: drag.steps });
    await page.mouse.up({ button: "left" });
    await page.waitForTimeout(180);
    const clip = await screenAnchor(page, buildingId);
    if (clip && (clip.clip.width < 24 || clip.clip.height < 16)) {
      throw new Error(`Freemasons footprint too small on screen after drag ${JSON.stringify(drag)}`);
    }
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: VIEW_W, height: VIEW_H } });
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
  await page.waitForFunction(
    () => window.__citycutQaModel?.getHeightPerfTimings?.().comAppliedMs != null,
    null,
    { timeout: 120_000 },
  );
  await page.waitForTimeout(1200);
} else {
  await page.waitForTimeout(5000);
}

const comToggle = page.getByRole("button", { name: /CoM 2023/i });
if (await comToggle.count()) {
  const wantOn = !comOff;
  const pressed = await comToggle.first().getAttribute("aria-pressed");
  if ((pressed === "true") !== wantOn) await comToggle.first().click();
  await page.waitForTimeout(comOff ? 1000 : 2000);
}

await replayObliqueSequence(page, BUILDING_ID, comOff);

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
      return text.includes("City of Melbourne");
    },
    null,
    { timeout: 120_000 },
  );
}

if (!(await assertFreemasonsVisible(page))) {
  throw new Error("Freemasons not centred/visible before screenshot");
}

await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: false });
copyOut(out);

const panel = await page.evaluate(() => document.querySelector(".building-detail-panel")?.textContent ?? "");
await browser.close();
console.log(JSON.stringify({ out, comOff, panelSnippet: panel.slice(0, 200), sequence: RECORDED }, null, 2));
