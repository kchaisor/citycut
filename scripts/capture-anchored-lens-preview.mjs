import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const PREVIEW_BASE = process.env.CITYCUT_PREVIEW_URL ?? "https://citycut-git-feat-anchored-lens-kchai.vercel.app/";
const SHARE = process.env.CITYCUT_PREVIEW_SHARE ?? "";
const OUT = "/opt/cursor/artifacts";
const VIEWPORT = { width: 1440, height: 900 };

function previewUrl() {
  const u = new URL(PREVIEW_BASE);
  u.searchParams.set("qa", "1");
  u.searchParams.set("qaHidePopover", "1");
  u.searchParams.set("lat", "-37.8136");
  u.searchParams.set("lon", "144.9831");
  u.searchParams.set("km", "1");
  if (SHARE) u.searchParams.set("_vercel_share", SHARE.replace(/^_vercel_share=/, ""));
  return u.toString();
}

function cardLegible(layout) {
  return layout && layout.onScreen && layout.width >= 220 && layout.height >= 96;
}

function yellowEdgePixels(pngPath) {
  const png = PNG.sync.read(fs.readFileSync(pngPath));
  let yellow = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    if (r > 230 && g > 230 && b < 80) yellow++;
  }
  return yellow;
}

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: VIEWPORT });
await context.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "citycut.view",
      JSON.stringify({ projection: "perspective", corner: "sw", freeRotate: false }),
    );
  } catch {
    // ignore
  }
});
const page = await context.newPage();
await page.goto(previewUrl(), { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("button.create-fab", { timeout: 60000 });
await page.click("button.create-fab");
await page.waitForFunction(() => Boolean(window.__citycutQaModel?.findTallBuildingForLensQa), { timeout: 180000 });
await page.evaluate(async () => {
  await window.__citycutQaModel?.waitForComHeightsApplied?.(180000);
});
await page.waitForTimeout(1500);

const target = await page.evaluate(() => window.__citycutQaModel?.findTallBuildingForLensQa?.() ?? null);
if (!target) throw new Error("No tall building target for lens capture");
await page.mouse.click(target.clickX, target.clickY);
await page.waitForSelector('[data-anchored-lens="open"]', { timeout: 30000 });
await page.waitForTimeout(500);

const openPath = path.join(OUT, "anchored-lens-east-melbourne-open.png");
let layout = await page.evaluate(() => window.__citycutQaModel?.getAnchoredLensLayout?.() ?? null);
if (!cardLegible(layout)) throw new Error(`Card not legible on open shot: ${JSON.stringify(layout)}`);
await page.screenshot({ path: openPath });
if (yellowEdgePixels(openPath) < 120) throw new Error("Open shot missing visible yellow card edge");

const canvasBox = await page.locator(".model canvas").boundingBox();
if (!canvasBox) throw new Error("No canvas");
const cx = canvasBox.x + canvasBox.width * 0.52;
const cy = canvasBox.y + canvasBox.height * 0.5;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 160, cy - 48, { steps: 22 });
await page.mouse.up();
await page.waitForTimeout(600);
layout = await page.evaluate(() => window.__citycutQaModel?.getAnchoredLensLayout?.() ?? null);
if (!cardLegible(layout)) throw new Error(`Card not legible after orbit: ${JSON.stringify(layout)}`);
const orbitPath = path.join(OUT, "anchored-lens-orbit-anchor.png");
await page.screenshot({ path: orbitPath });

await page.waitForTimeout(600);
await page.locator('[data-anchored-lens-action="cut"]').hover({ force: true });
await page.waitForTimeout(450);
const tipPath = path.join(OUT, "anchored-lens-disabled-tooltip.png");
await page.screenshot({ path: tipPath });
const orbitBytes = fs.readFileSync(orbitPath);
const tipBytes = fs.readFileSync(tipPath);
if (orbitBytes.equals(tipBytes)) throw new Error("Tooltip shot is identical to orbit shot");

const framesDir = "/tmp/anchored_lens_video_frames";
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
const reopen = await page.evaluate(
  (id) => window.__citycutQaModel?.resolveLensBuildingClick?.(id) ?? null,
  target.id,
);
if (reopen) await page.mouse.click(reopen.clickX, reopen.clickY);
await page.waitForSelector('[data-anchored-lens="open"]', { timeout: 15000 });
let fi = 0;
for (let i = 0; i < 8; i++) {
  await page.screenshot({ path: path.join(framesDir, `f${String(fi++).padStart(4, "0")}.png`) });
  await page.waitForTimeout(80);
}
if (canvasBox) {
  const ox = canvasBox.x + canvasBox.width * 0.5;
  const oy = canvasBox.y + canvasBox.height * 0.48;
  await page.mouse.move(ox, oy);
  await page.mouse.down();
  for (let s = 1; s <= 28; s++) {
    await page.mouse.move(ox + (160 * s) / 28, oy - (44 * s) / 28);
    await page.waitForTimeout(40);
    await page.screenshot({ path: path.join(framesDir, `f${String(fi++).padStart(4, "0")}.png`) });
  }
  await page.mouse.up();
}
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(80);
  await page.screenshot({ path: path.join(framesDir, `f${String(fi++).padStart(4, "0")}.png`) });
}
await page.keyboard.press("Escape");
await page.waitForTimeout(250);
for (let i = 0; i < 4; i++) {
  await page.screenshot({ path: path.join(framesDir, `f${String(fi++).padStart(4, "0")}.png`) });
  await page.waitForTimeout(80);
}

const { execFileSync } = await import("node:child_process");
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-framerate",
    "12",
    "-i",
    `${framesDir}/f%04d.png`,
    "-vf",
    "scale=1440:900",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "20",
    path.join(OUT, "anchored-lens-orbit-demo.mp4"),
  ],
  { stdio: "inherit" },
);

await browser.close();
console.log("Artifacts OK:", OUT);
