import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const baseFromEnv = process.env.CITYCUT_PREVIEW_URL ?? process.env.VERIFY_BASE_URL;
const OUT = "/opt/cursor/artifacts";
const VIEWPORT = { width: 1440, height: 900 };
const BOX_HILL = { lat: "-37.8187756", lon: "145.1266505", km: "1" };

function modelUrl(base) {
  const u = new URL(base.endsWith("/") ? base : `${base}/`);
  u.searchParams.set("qa", "1");
  u.searchParams.set("qaHidePopover", "1");
  u.searchParams.set("lat", BOX_HILL.lat);
  u.searchParams.set("lon", BOX_HILL.lon);
  u.searchParams.set("km", BOX_HILL.km);
  return u.toString();
}

fs.mkdirSync(OUT, { recursive: true });

const port = process.env.VERIFY_PORT;
const baseUrl = baseFromEnv ?? (port ? `http://127.0.0.1:${port}/citycut/` : null);
if (!baseUrl) {
  throw new Error("Set CITYCUT_PREVIEW_URL, VERIFY_BASE_URL, or VERIFY_PORT");
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
    window.localStorage.setItem("citycut.view3d.whiteCard", "1");
  } catch {
    // ignore
  }
});
const page = await context.newPage();
await page.goto(modelUrl(baseUrl), { waitUntil: "domcontentloaded", timeout: 120000 });
await page.click("button.create-fab");
await page.waitForFunction(
  () => Boolean(window.__citycutQaModel?.pickForegroundBuildingForSelectionQa && window.__citycutQa?.pickBuildingAtClient),
  { timeout: 180000 },
);
await page.evaluate(async () => {
  await window.__citycutQaModel?.waitForComHeightsApplied?.(180000);
});
await page.waitForSelector(".model canvas", { timeout: 60000 });
await page.waitForTimeout(1200);

await page.evaluate(() => {
  const towerId = window.__citycutQaModel?.pickTallTowerForSelectionQa?.();
  if (towerId != null) {
    window.__citycutQaModel?.frameAerialSelectionBuilding?.(towerId);
    window.__citycutQaModel?.clearHeightSelection?.();
  }
});
await page.waitForTimeout(800);

let target = await page.evaluate(() => window.__citycutQaModel?.findTallBuildingForLensQa?.() ?? null);
if (!target) {
  await page.evaluate(() => {
    const midId = window.__citycutQaModel?.pickForegroundBuildingForSelectionQa?.();
    if (midId != null) {
      window.__citycutQaModel?.frameSelectionBuilding?.(midId, "oblique");
      window.__citycutQaModel?.clearHeightSelection?.();
    }
  });
  await page.waitForTimeout(800);
  target = await page.evaluate(() => window.__citycutQaModel?.findTallBuildingForLensQa?.() ?? null);
}
if (!target) {
  const candidateIds = await page.evaluate(() =>
    (window.__citycutQaModel?.listBuildings?.() ?? [])
      .filter((row) => row.height >= 14)
      .sort((a, b) => b.height - a.height)
      .slice(0, 80)
      .map((row) => row.id),
  );
  for (const buildingId of candidateIds) {
    target = await page.evaluate((id) => {
      window.__citycutQaModel?.frameSelectionBuilding?.(id, "oblique");
      window.__citycutQaModel?.clearHeightSelection?.();
      const click = window.__citycutQaModel?.resolveLensBuildingClick?.(id);
      if (!click) return null;
      const clip = window.__citycutQaModel?.selectionScreenClip?.(id, 12);
      const canvas = document.querySelector(".model canvas")?.getBoundingClientRect();
      if (!clip || !canvas || clip.width < 18 || clip.height < 18) return null;
      const cx = clip.x + clip.width / 2;
      const cy = clip.y + clip.height / 2;
      if (
        cx < canvas.left + 72 ||
        cx > canvas.right - 72 ||
        cy < canvas.top + 72 ||
        cy > canvas.bottom - 72
      ) {
        return null;
      }
      const row = window.__citycutQaModel?.listBuildings?.().find((item) => item.id === id);
      return {
        id,
        height: row?.height ?? 0,
        dist: 0,
        clickX: click.clickX,
        clickY: click.clickY,
      };
    }, buildingId);
    if (target) break;
    await page.waitForTimeout(350);
  }
}
if (!target) throw new Error("No building hover target in Box Hill white-card view");

await page.waitForTimeout(900);

const canvasBox = await page.locator(".model canvas").boundingBox();
if (canvasBox) {
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.12, canvasBox.y + canvasBox.height * 0.92);
}
await page.waitForTimeout(300);
const canvas = page.locator(".model canvas");
const canvasRect = await canvas.boundingBox();
if (!canvasRect) throw new Error("No 3D canvas for hover capture");
await canvas.hover({
  position: {
    x: Math.max(8, Math.min(canvasRect.width - 8, target.clickX - canvasRect.x)),
    y: Math.max(8, Math.min(canvasRect.height - 8, target.clickY - canvasRect.y)),
  },
});
await page.waitForTimeout(350);
await canvas.hover({
  position: {
    x: Math.max(8, Math.min(canvasRect.width - 8, target.clickX - canvasRect.x + 1)),
    y: Math.max(8, Math.min(canvasRect.height - 8, target.clickY - canvasRect.y)),
  },
});
await canvas.hover({
  position: {
    x: Math.max(8, Math.min(canvasRect.width - 8, target.clickX - canvasRect.x)),
    y: Math.max(8, Math.min(canvasRect.height - 8, target.clickY - canvasRect.y)),
  },
});
await page.evaluate(
  (id) => window.__citycutQaModel?.setBuildingHoverHighlightForQa?.(id) ?? null,
  target.id,
);
await page.evaluate(
  () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
);
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(OUT, "hover-b85-box-hill-white.png") });

const clip = await page.evaluate((id) => window.__citycutQaModel?.selectionScreenClip?.(id, 16) ?? null, target.id);
if (clip && clip.width > 40 && clip.height > 40) {
  const pad = 12;
  await page.screenshot({
    path: path.join(OUT, "hover-b85-box-hill-white-closeup.png"),
    clip: {
      x: Math.max(0, clip.x - pad),
      y: Math.max(0, clip.y - pad),
      width: Math.min(VIEWPORT.width, clip.width + pad * 2),
      height: Math.min(VIEWPORT.height, clip.height + pad * 2),
    },
  });
} else {
  await page.screenshot({
    path: path.join(OUT, "hover-b85-box-hill-white-closeup.png"),
    clip: {
      x: Math.max(0, target.clickX - 120),
      y: Math.max(0, target.clickY - 120),
      width: 240,
      height: 240,
    },
  });
}

await browser.close();
console.log(JSON.stringify({ out: OUT, targetId: target.id }, null, 2));
