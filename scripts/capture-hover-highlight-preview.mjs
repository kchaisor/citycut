import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const PREVIEW_BASE = process.env.CITYCUT_PREVIEW_URL ?? "https://citycut-git-feat-anchored-lens-hover-highlight-kchai.vercel.app/";
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

function canvasHoverState(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".model canvas");
    const style = canvas instanceof HTMLCanvasElement ? getComputedStyle(canvas) : null;
    return {
      highlightId: canvas instanceof HTMLCanvasElement ? canvas.dataset.buildingHoverHighlightId ?? "" : "",
      highlightActive: canvas instanceof HTMLCanvasElement ? canvas.dataset.buildingHoverHighlightActive === "1" : false,
      cursor: style?.cursor ?? "",
    };
  });
}

fs.mkdirSync(OUT, { recursive: true });

const consoleErrors = [];
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
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

const frameTimes = [];
let lastFrame = performance.now();
await page.exposeFunction("__citycutRecordFrame", () => {
  const now = performance.now();
  frameTimes.push(now - lastFrame);
  lastFrame = now;
});
await page.addInitScript(() => {
  function loop() {
    window.__citycutRecordFrame?.();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});

await page.goto(previewUrl(), { waitUntil: "domcontentloaded", timeout: 120000 });
await page.click("button.create-fab");
await page.waitForFunction(() => Boolean(window.__citycutQaModel?.findTallBuildingForLensQa), { timeout: 180000 });
await page.evaluate(async () => {
  await window.__citycutQaModel?.waitForComHeightsApplied?.(180000);
});
await page.waitForSelector(".model canvas", { timeout: 60000 });
await page.waitForTimeout(1500);

const target = await page.evaluate(() => window.__citycutQaModel?.findTallBuildingForLensQa?.() ?? null);
const pair = await page.evaluate(() => window.__citycutQaModel?.findLensHoverPairQa?.() ?? null);
if (!target) throw new Error("No lens target");
const canvasBox = await page.locator(".model canvas").boundingBox();
if (!canvasBox) throw new Error("No canvas");

await page.mouse.move(canvasBox.x + canvasBox.width * 0.12, canvasBox.y + canvasBox.height * 0.92);
await page.waitForTimeout(300);
await page.mouse.move(target.clickX, target.clickY);
await page.waitForTimeout(400);
let hover = await canvasHoverState(page);
if (!hover.highlightActive || hover.cursor !== "pointer") {
  throw new Error(`Hover highlight not active: ${JSON.stringify(hover)}`);
}
await page.screenshot({ path: path.join(OUT, "hover-highlight.png") });

if (pair) {
  await page.mouse.move(pair.a.clickX, pair.a.clickY);
  await page.waitForTimeout(250);
  await page.mouse.move(pair.b.clickX, pair.b.clickY, { steps: 10 });
  await page.waitForTimeout(300);
  hover = await canvasHoverState(page);
  if (!hover.highlightActive) throw new Error(`Switch highlight missing: ${JSON.stringify(hover)}`);
  await page.screenshot({ path: path.join(OUT, "hover-highlight-switch.png") });
} else {
  fs.copyFileSync(path.join(OUT, "hover-highlight.png"), path.join(OUT, "hover-highlight-switch.png"));
}

await page.evaluate((id) => window.__citycutQaModel?.openAnchoredLensForBuilding?.(id), target.id);
await page.waitForFunction(
  () =>
    window.__citycutQaModel?.getAnchoredLensMode?.() === "pinned" &&
    Boolean(document.querySelector('[data-anchored-lens="open"]')),
  { timeout: 20000 },
);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, "hover-highlight-pinned.png") });

const framesDir = "/tmp/hover_highlight_video_frames";
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });
let fi = 0;
const snap = async () => {
  await page.screenshot({ path: path.join(framesDir, `f${String(fi++).padStart(4, "0")}.png`) });
};

await page.keyboard.press("Escape");
await page.waitForTimeout(300);
if (pair) {
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const x = pair.a.clickX + (pair.b.clickX - pair.a.clickX) * t;
    const y = pair.a.clickY + (pair.b.clickY - pair.a.clickY) * t;
    await page.mouse.move(x, y, { steps: 2 });
    await page.waitForTimeout(80);
    await snap();
  }
} else {
  await page.mouse.move(target.clickX, target.clickY);
  await snap();
  await page.waitForTimeout(200);
  await page.mouse.move(target.clickX + 40, target.clickY + 20);
  await snap();
}

execFileSync(
  "ffmpeg",
  [
    "-y",
    "-framerate",
    "12",
    "-i",
    path.join(framesDir, "f%04d.png"),
    "-vf",
    "scale=1440:900",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    path.join(OUT, "hover-highlight-demo.mp4"),
  ],
  { stdio: "inherit" },
);

const perf = await page.evaluate((samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const avg = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
  return { frames: sorted.length, avgMs: avg, p95Ms: p95, maxMs: sorted[sorted.length - 1] ?? 0 };
}, frameTimes);

fs.writeFileSync(
  path.join(OUT, "hover-highlight-report.json"),
  JSON.stringify({ consoleErrors, perf, previewUrl: previewUrl() }, null, 2),
);

await browser.close();
console.log(JSON.stringify({ consoleErrors: consoleErrors.length, perf }, null, 2));
