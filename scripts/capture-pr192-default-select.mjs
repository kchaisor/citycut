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

async function settleDefaultCamera(page) {
  const reset = page.getByRole("button", { name: "Reset view" });
  await reset.click({ timeout: 60000 });
  await page.waitForTimeout(600);
  await reset.click({ timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const sideM = 1000;
    const d = sideM * 0.92;
    window.__citycutQa?.setCamera?.({
      eye: { x: d * 0.72, y: d * 0.78, z: -d * 0.72 },
      target: { x: 0, y: 25, z: 0 },
    });
  });
  await page.waitForTimeout(900);
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
    window.localStorage.clear();
    window.localStorage.setItem(
      "citycut.view",
      JSON.stringify({ projection: "perspective", corner: "sw", freeRotate: false }),
    );
  } catch {
  }
});
const page = await context.newPage();
page.setDefaultTimeout(120000);
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
await settleDefaultCamera(page);
await page.evaluate(() => {
  window.__citycutQaModel?.clearHeightSelection?.();
});
await page.waitForTimeout(800);
await flushCanvasFrame(page);
await page.screenshot({ path: path.join(OUT, "pr192-fresh-model-default-uniform.png") });

const treesRow = page.locator('.model .left-outliner [aria-label="Layers"] button.studio-layer-row').filter({ hasText: /^Trees$/ });
if (await treesRow.count()) {
  const pressed = await treesRow.getAttribute("aria-pressed");
  if (pressed !== "true") await treesRow.click();
  await page.waitForTimeout(1200);
  await flushCanvasFrame(page);
  await page.screenshot({ path: path.join(OUT, "pr192-tree-crown-four-variants.png") });
}

await page.evaluate(() => {
  window.__citycutQaModel?.clearHeightSelection?.();
});
await page.waitForTimeout(400);
const pickAtDefaultCamera = await page.evaluate(() => {
  const canvas = document.querySelector(".model canvas");
  const pickAt = window.__citycutQa?.pickBuildingAtClient;
  if (!(canvas instanceof HTMLCanvasElement) || !pickAt) return null;
  const rect = canvas.getBoundingClientRect();
  const heightById = new Map(
    (window.__citycutQaModel?.listBuildings?.() ?? []).map((row) => [row.id, row.height]),
  );
  const cx = rect.left + rect.width * 0.5;
  const cy = rect.top + rect.height * 0.52;
  let best = null;
  for (let y = rect.top + 120; y < rect.bottom - 100; y += 16) {
    for (let x = rect.left + 220; x < rect.right - 280; x += 16) {
      const id = pickAt(x, y);
      if (id == null) continue;
      const top = document.elementFromPoint(x, y);
      if (top !== canvas) continue;
      const height = heightById.get(id) ?? 0;
      const dist = Math.hypot(x - cx, y - cy);
      const score = height * 1000 - dist;
      if (!best || score > best.score) {
        best = { id, clickX: Math.round(x), clickY: Math.round(y), height, score };
      }
    }
  }
  return best;
});
if (!pickAtDefaultCamera) throw new Error("No building click target at default camera");
const buildingId = pickAtDefaultCamera.id;
const click = { clickX: pickAtDefaultCamera.clickX, clickY: pickAtDefaultCamera.clickY };

await page.mouse.move(click.clickX, click.clickY);
await page.waitForTimeout(280);
await page.mouse.click(click.clickX, click.clickY, { force: true });
await page.waitForFunction(
  () => {
    const audit = window.__citycutQaSelectionAudit;
    return (
      audit &&
      audit.overlayDashedLineCount > 0 &&
      audit.selectionFillMeshCount > 0 &&
      audit.hiddenMeshCount === 0
    );
  },
  { timeout: 20000 },
);
await flushCanvasFrame(page);

const audit = await page.evaluate(() => window.__citycutQaSelectionAudit ?? null);
if (
  !audit ||
  audit.overlayDashedLineCount < 1 ||
  audit.hiddenMeshCount !== 0 ||
  audit.zeroedGroupCount !== 0 ||
  audit.selectionFillMeshCount < 1 ||
  audit.selectionFillAccentHex?.toLowerCase() !== "fff500"
) {
  throw new Error(`Selection outline audit failed: ${JSON.stringify(audit)}`);
}
await page.screenshot({ path: path.join(OUT, "pr192-building-click-dashed-outline.png") });

const clip = await page.evaluate(
  (id) => window.__citycutQaModel?.selectionScreenClip?.(id, 16) ?? null,
  buildingId,
);
if (clip && clip.width >= 48 && clip.height >= 48) {
  await page.screenshot({
    path: path.join(OUT, "pr192-building-click-dashed-outline-crop.png"),
    clip: {
      x: Math.max(0, clip.x - 8),
      y: Math.max(0, clip.y - 8),
      width: Math.min(VIEWPORT.width, clip.width + 16),
      height: Math.min(VIEWPORT.height, clip.height + 16),
    },
  });
}

const canvasBox = await page.locator(".model canvas").boundingBox();
if (!canvasBox) throw new Error("No canvas");
const framesDir = "/tmp/pr192_hover_click_frames";
fs.mkdirSync(framesDir, { recursive: true });
let frameIndex = 0;
const snap = async () => {
  const file = path.join(framesDir, `f${String(frameIndex++).padStart(3, "0")}.png`);
  await page.screenshot({ path: file });
};
await snap();
await page.mouse.move(canvasBox.x + canvasBox.width * 0.15, canvasBox.y + canvasBox.height * 0.85);
await page.waitForTimeout(200);
const hoverTarget = await page.evaluate(() => window.__citycutQaModel?.findTallBuildingForLensQa?.() ?? null);
if (hoverTarget) {
  const hClick = await page.evaluate(
    (id) => window.__citycutQaModel?.resolveLensBuildingClick?.(id) ?? null,
    hoverTarget.id,
  );
  if (hClick) {
    await page.mouse.move(hClick.clickX, hClick.clickY, { steps: 8 });
    await page.waitForTimeout(400);
    await page.waitForFunction(
      () => document.querySelector(".model canvas")?.dataset.buildingHoverHighlightActive === "1",
      { timeout: 15000 },
    );
    await snap();
    await page.mouse.click(hClick.clickX, hClick.clickY);
    await page.waitForTimeout(500);
    await snap();
  }
}
await page.evaluate(() => {
  const frames = 4;
  for (let i = 0; i < frames; i++) {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {}));
  }
});
const clipOut = path.join(OUT, "pr192-hover-then-click.mp4");
try {
  const { execSync } = await import("node:child_process");
  execSync(
    `ffmpeg -y -framerate 2 -i ${framesDir}/f%03d.png -vf scale=1440:900 -c:v libx264 -pix_fmt yuv420p ${clipOut}`,
    { stdio: "ignore" },
  );
} catch {
  fs.copyFileSync(path.join(framesDir, "f000.png"), path.join(OUT, "pr192-hover-then-click-fallback.png"));
}

await browser.close();
console.log(JSON.stringify({ out: OUT, buildingId, audit, preview: baseUrl }, null, 2));
