import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const OUT = "/opt/cursor/artifacts";
const VIEWPORT = { width: 1440, height: 900 };
const CAPTURE_SITE = { lat: "-37.8136", lon: "144.9831", km: "1" };

function modelUrl(base) {
  const u = new URL(base);
  u.searchParams.set("qa", "1");
  u.searchParams.set("qaHidePopover", "1");
  u.searchParams.set("lat", CAPTURE_SITE.lat);
  u.searchParams.set("lon", CAPTURE_SITE.lon);
  u.searchParams.set("km", CAPTURE_SITE.km);
  return u.toString();
}

async function flushCanvasFrame(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.waitForTimeout(120);
}

fs.mkdirSync(OUT, { recursive: true });

const baseUrl = process.env.CITYCUT_PREVIEW_URL ?? process.env.VERIFY_BASE_URL;
if (!baseUrl) {
  console.error("Set CITYCUT_PREVIEW_URL or VERIFY_BASE_URL");
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  reducedMotion: "no-preference",
});
await context.addInitScript(() => {
  window.__citycutMinSilentLoadMs = 550;
  try {
    window.localStorage.setItem(
      "citycut.view",
      JSON.stringify({ projection: "perspective", corner: "sw", freeRotate: false }),
    );
    window.localStorage.setItem("citycut.view3d.whiteCard", "0");
  } catch {
  }
});
const page = await context.newPage();
await page.goto(modelUrl(baseUrl), { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForSelector("button.create-fab", { timeout: 60000 });
await page.click("button.create-fab");
await page.waitForFunction(
  () =>
    Boolean(
      window.__citycutQaModel?.frameHoverHighlightCaptureBuilding &&
        window.__citycutQa?.pickBuildingAtClient,
    ),
  { timeout: 180000 },
);
await page.evaluate(async () => {
  await window.__citycutQaModel?.waitForComHeightsApplied?.(180000);
});
await page.waitForSelector(".model canvas", { timeout: 60000 });
await page.waitForTimeout(2000);
await flushCanvasFrame(page);
await page.screenshot({ path: path.join(OUT, "white-palette-box-hill-wide.png") });

let lensTarget = await page.evaluate(() => window.__citycutQaModel?.findTallBuildingForLensQa?.() ?? null);
if (!lensTarget) {
  const midId = await page.evaluate(() => {
    const id = window.__citycutQaModel?.pickForegroundBuildingForSelectionQa?.();
    if (id != null) {
      window.__citycutQaModel?.frameSelectionBuilding?.(id, "oblique");
      window.__citycutQaModel?.clearHeightSelection?.();
    }
    return id;
  });
  await page.waitForTimeout(800);
  if (midId != null) {
    lensTarget = await page.evaluate((id) => {
      const click = window.__citycutQaModel?.resolveLensBuildingClick?.(id);
      if (!click) return null;
      return { id, clickX: click.clickX, clickY: click.clickY, height: 0 };
    }, midId);
  }
}
if (!lensTarget) throw new Error("No building target for hover capture");

let best = null;
for (let t = 0.16; t <= 0.32; t += 0.004) {
  const scored = await page.evaluate(
    ({ id, tightness }) => {
      window.__citycutQaModel?.frameHoverHighlightCaptureBuilding?.(id, tightness);
      window.__citycutQaModel?.clearHeightSelection?.();
      const measured = window.__citycutQaModel?.measureHoverCaptureFill?.(id);
      if (!measured?.onScreen) return null;
      const click = measured.click;
      const clickX = click ? click.clickX : Math.round(measured.cx);
      const clickY = click ? click.clickY : Math.round(measured.cy);
      const top = document.elementFromPoint(clickX, clickY);
      if (!(top instanceof HTMLCanvasElement)) return null;
      const fillScore = 1 - Math.abs(measured.fill - 0.25);
      return {
        tightness,
        clickX,
        clickY,
        fill: measured.fill,
        score: fillScore * 2 + measured.fill,
      };
    },
    { id: lensTarget.id, tightness: t },
  );
  if (
    scored &&
    scored.fill >= 0.08 &&
    scored.fill <= 0.38 &&
    (!best || scored.score > best.score)
  ) {
    best = { ...scored, id: lensTarget.id };
  }
}

if (!best) throw new Error("Could not frame building on canvas for hover capture");

await page.evaluate(
  ({ id, tightness }) => {
    window.__citycutQaModel?.frameHoverHighlightCaptureBuilding?.(id, tightness);
    window.__citycutQaModel?.clearHeightSelection?.();
  },
  { id: best.id, tightness: best.tightness },
);
await page.waitForTimeout(900);

const canvasBox = await page.locator(".model canvas").boundingBox();
if (!canvasBox) throw new Error("No 3D canvas");
await page.mouse.move(canvasBox.x + canvasBox.width * 0.1, canvasBox.y + canvasBox.height * 0.92);
await page.waitForTimeout(280);
await page.mouse.move(best.clickX, best.clickY);
await page.waitForTimeout(320);
await page.mouse.move(best.clickX + 1, best.clickY);
await page.mouse.move(best.clickX, best.clickY);
await page.waitForFunction(
  () => document.querySelector(".model canvas")?.dataset.buildingHoverHighlightActive === "1",
  { timeout: 25000 },
);
for (let attempt = 0; attempt < 4; attempt++) {
  await page.mouse.move(best.clickX + (attempt % 2), best.clickY);
  await flushCanvasFrame(page);
}
await page.waitForTimeout(800);
const yellowCheck = await page.evaluate(
  ({ x, y }) => ({
    yellow: window.__citycutQaModel?.countHoverAccentYellowNearClient?.(x, y, 40) ?? 0,
    active: document.querySelector(".model canvas")?.dataset.buildingHoverHighlightActive === "1",
  }),
  { x: best.clickX, y: best.clickY },
);
if (!yellowCheck.active) {
  throw new Error(`Real hover highlight state not active (yellow=${yellowCheck.yellow})`);
}
await page.waitForTimeout(450);
await page.screenshot({ path: path.join(OUT, "white-palette-box-hill-hover-b85.png") });

await browser.close();
console.log(
  JSON.stringify(
    {
      out: OUT,
      targetId: best.id,
      fill: best.fill,
      yellow: yellowCheck.yellow,
      preview: baseUrl,
    },
    null,
    2,
  ),
);
