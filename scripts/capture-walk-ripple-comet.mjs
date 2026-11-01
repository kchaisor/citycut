#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const VIEWPORT = { width: 1440, height: 900 };
const OUT_WIDE = "/opt/cursor/artifacts/walk-ripple-comet-box-hill-wide.png";
const OUT_HEAD = "/opt/cursor/artifacts/walk-ripple-comet-head-closeup.png";
const OUT_MP4 = "/opt/cursor/artifacts/walk-ripple-comet-wave-playback.mp4";
const BOX_HILL_LAT = -37.8182;
const BOX_HILL_LON = 145.1234;
const KM_WIDE = 1.2;
const RECORD_MS = 10000;

const COMET_HEAD = { r: 255, g: 244, b: 168 };
const COMET_TAIL = { r: 255, g: 176, b: 32 };
const BAND_0 = { r: 255, g: 245, b: 0 };
const BAND_1 = { r: 255, g: 140, b: 0 };
const BAND_2 = { r: 232, g: 93, b: 4 };
const ORIGIN_ACCENT = { r: 255, g: 245, b: 0 };

function channelDist(r, g, b, ref) {
  return Math.max(Math.abs(r - ref.r), Math.abs(g - ref.g), Math.abs(b - ref.b));
}

function isRoadishGrey(r, g, b) {
  if (Math.abs(r - g) > 22 || Math.abs(g - b) > 22) return false;
  return r >= 150 && r <= 235 && g >= 150 && g <= 235;
}

function isRibbonBandToken(r, g, b) {
  if (channelDist(r, g, b, BAND_0) <= 35) return true;
  if (channelDist(r, g, b, BAND_1) <= 40) return true;
  if (channelDist(r, g, b, BAND_2) <= 40) return true;
  if (channelDist(r, g, b, COMET_TAIL) <= 45) return true;
  return r >= 220 && g >= 100 && g <= 230 && b <= 100;
}

function isRibbonHeadToken(r, g, b) {
  if (channelDist(r, g, b, ORIGIN_ACCENT) <= 12 && g > 240) return false;
  return channelDist(r, g, b, COMET_HEAD) <= 45 || (r >= 248 && g >= 230 && b >= 100 && b <= 240);
}

function countRibbonTokensOnRoadBand(pngPath) {
  const png = PNG.sync.read(fs.readFileSync(pngPath));
  const y0 = 72;
  const y1 = 780;
  const x0 = 64;
  const x1 = 1376;
  let head = 0;
  let tail = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (png.width * y + x) * 4;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const a = png.data[i + 3];
      if (a < 150) continue;
      if (isRibbonHeadToken(r, g, b)) head += 1;
      else if (isRibbonBandToken(r, g, b)) tail += 1;
    }
  }
  return { head, tail, total: head + tail };
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => resolve(typeof addr === "object" && addr ? addr.port : 5188));
    });
    srv.on("error", reject);
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server not ready: ${url}`);
}

async function resolveAppBase(baseUrl) {
  for (const suffix of ["/citycut/", "/"]) {
    try {
      const res = await fetch(`${baseUrl}${suffix}`);
      if (res.ok) return `${baseUrl}${suffix}`;
    } catch {
    }
  }
  return `${baseUrl}/citycut/`;
}

async function setupBoxHillWalkRipple(page) {
  await page.addInitScript(() => {
    window.__citycutAwaitIntroStart = true;
    window.__citycutMinSilentLoadMs = 0;
    try {
      window.localStorage.setItem("citycut.view", JSON.stringify({ projection: "perspective", corner: "sw", freeRotate: false }));
    } catch {
    }
  });
  const captureUrl = process.env.CAPTURE_BASE_URL?.trim();
  let appBase;
  let viteProc = null;
  if (captureUrl) {
    if (captureUrl.includes("_vercel_share=") || captureUrl.includes("?")) {
      appBase = captureUrl;
    } else {
      const remoteBase = captureUrl.replace(/\/$/, "");
      appBase = await resolveAppBase(remoteBase);
    }
    console.log("[capture-walk-ripple-comet] remote base", appBase);
  } else {
    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    viteProc = spawn(
      path.join(process.cwd(), "node_modules/.bin/vite"),
      ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
      { cwd: process.cwd(), stdio: "ignore" },
    );
    await waitForServer(`${baseUrl}/citycut/`);
    appBase = `${baseUrl}/citycut/`;
  }

  const modelQuery = new URLSearchParams({
    lat: String(BOX_HILL_LAT),
    lon: String(BOX_HILL_LON),
    km: String(KM_WIDE),
    label: "Box Hill VIC",
    qa: "1",
  });
  const entryUrl = appBase.includes("?") ? `${appBase}&${modelQuery}` : `${appBase}?${modelQuery}`;
  await page.goto(entryUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.getByRole("button", { name: /Create model/i }).click({ timeout: 180000 });
  await page.waitForSelector(".model canvas", { timeout: 180000 });
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector(".model canvas");
      return canvas && canvas.dataset.camKind === "perspective";
    },
    { timeout: 60000 },
  );
  await page.getByRole("button", { name: "Reset view" }).click({ timeout: 15000 });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Reset view" }).click({ timeout: 15000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const sideM = 1200;
    const d = sideM * 0.92;
    window.__citycutQa?.setCamera({
      eye: { x: d * 0.68, y: d * 0.74, z: -d * 0.68 },
      target: { x: 0, y: 28, z: 0 },
    });
  });
  await page.waitForTimeout(800);
  await page.locator('.model button[data-section="analysis"]').first().click();
  await page.waitForTimeout(350);
  await page.getByRole("tab", { name: /Walk Ripple/i }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Pick origin/i }).first().click();
  const canvas = page.locator(".model canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("No canvas");
  await page.mouse.click(box.x + box.width * 0.48, box.y + box.height * 0.55);
  await page.waitForFunction(() => Boolean(window.__citycutWalkRippleQa), { timeout: 120000 });
  await page.waitForTimeout(1200);
  return viteProc;
}

async function runCapture(page) {
  const viteProc = await setupBoxHillWalkRipple(page);
  await page.getByRole("button", { name: /Replay walk ripple/i }).click();
  const waveT0 = Date.now();
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    window.__citycutWalkRippleQa?.setMinutes?.(11);
    window.__citycutWalkRippleQa?.setBandMixStrength?.(0);
    window.__citycutWalkRippleQa?.setOriginMarkerVisible?.(false);
  });
  await page.waitForTimeout(600);
  const diag = await page.evaluate(() => window.__citycutWalkRippleQa?.getRibbonDiagnostics?.() ?? null);
  console.log("[DIAG]", JSON.stringify(diag));
  if (diag?.ribbonHalfWidthM != null && (diag.ribbonHalfWidthM < 4 || diag.ribbonHalfWidthM > 6.01)) {
    throw new Error(`ribbonHalfWidthM out of range: ${diag.ribbonHalfWidthM}`);
  }
  if (diag?.maxTriangleEdgeM != null && diag.maxTriangleEdgeM > 520) {
    throw new Error(`maxTriangleEdgeM too large (cross-edge wedge): ${diag.maxTriangleEdgeM}`);
  }
  await page.screenshot({ path: OUT_WIDE, clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height } });
  const widePixels = countRibbonTokensOnRoadBand(OUT_WIDE);
  console.log("[PIXELS] wide ribbon tokens (road band)", widePixels);
  if (widePixels.total < 80000) {
    throw new Error(`Ribbon token pixels too low on wide shot: ${JSON.stringify(widePixels)}`);
  }
  await page.evaluate(() => {
    window.__citycutQa?.setCamera({
      eye: { x: 52, y: 150, z: -52 },
      target: { x: 0, y: 6, z: 0 },
    });
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: OUT_HEAD, clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height } });
  const headPixels = countRibbonTokensOnRoadBand(OUT_HEAD);
  console.log("[PIXELS] head close-up ribbon tokens", headPixels);
  if (headPixels.tail < 800 || headPixels.total < 1200) {
    throw new Error(`Head close-up ribbon tokens too low: ${JSON.stringify(headPixels)}`);
  }
  await page.evaluate(() => {
    const sideM = 1200;
    const d = sideM * 0.92;
    window.__citycutQa?.setCamera({
      eye: { x: d * 0.68, y: d * 0.74, z: -d * 0.68 },
      target: { x: 0, y: 28, z: 0 },
    });
  });
  await page.waitForTimeout(400);
  const elapsed = Date.now() - waveT0;
  if (elapsed < RECORD_MS) await page.waitForTimeout(RECORD_MS - elapsed);
  await page.getByRole("button", { name: /Replay walk ripple/i }).click();
  await page.waitForTimeout(5200);
  const rawVideo = await page.video()?.path();
  if (viteProc) viteProc.kill("SIGTERM");
  return rawVideo;
}

async function main() {
  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  const videoDir = "/tmp/walk_ripple_comet_video";
  fs.rmSync(videoDir, { recursive: true, force: true });
  fs.mkdirSync(videoDir, { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: VIEWPORT },
  });
  const page = await context.newPage();
  const rawVideo = await runCapture(page);
  await context.close();
  await browser.close();
  if (!rawVideo) throw new Error("Playwright recordVideo missing output");
  const { execFileSync } = await import("node:child_process");
  const dur = Number.parseFloat(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", rawVideo], {
      encoding: "utf8",
    }).trim(),
  );
  const clipStart = Number.isFinite(dur) && dur > 10.5 ? Math.max(0, dur - 10) : 0;
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      String(clipStart),
      "-i",
      rawVideo,
      "-t",
      "10",
      "-vf",
      "fps=24",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "18",
      OUT_MP4,
    ],
    { stdio: "inherit" },
  );
  console.log("[ARTIFACT]", OUT_WIDE);
  console.log("[ARTIFACT]", OUT_HEAD);
  console.log("[ARTIFACT]", OUT_MP4);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
