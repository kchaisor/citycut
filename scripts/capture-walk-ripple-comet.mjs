#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { chromium } from "playwright";

const VIEWPORT = { width: 1440, height: 900 };
const OUT_PNG = "/opt/cursor/artifacts/walk-ripple-comet-box-hill-wide.png";
const OUT_MP4 = "/opt/cursor/artifacts/walk-ripple-comet-trail-slider.mp4";
const TMP_FRAMES = "/tmp/walk_ripple_comet_frames";
const BOX_HILL_LAT = -37.8182;
const BOX_HILL_LON = 145.1234;
const KM_WIDE = 1.2;

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

async function runCapture(page) {
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
  const entryUrl = appBase.includes("?")
    ? `${appBase}&${modelQuery}`
    : `${appBase}?${modelQuery}`;
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
  await page.evaluate(() => window.__citycutWalkRippleQa?.setMinutes(6));
  await page.waitForTimeout(500);

  let frame = 0;
  const grab = async () => {
    await page.screenshot({ path: path.join(TMP_FRAMES, `f${String(frame++).padStart(3, "0")}.png`) });
  };

  await grab();
  await page.screenshot({ path: OUT_PNG, clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height } });

  const trailSlider = page.locator(".model .env-bottom-row .walk-ripple-console-trail input[type='range']");
  await trailSlider.waitFor({ state: "visible", timeout: 10000 });
  for (const val of [2, 8, 4, 10, 3, 7, 5, 9, 1, 6]) {
    await trailSlider.fill(String(val));
    await page.waitForTimeout(500);
    await grab();
  }
  await page.evaluate(() => window.__citycutWalkRippleQa?.setMinutes(11));
  await page.waitForTimeout(500);
  await trailSlider.fill("6");
  await page.waitForTimeout(500);
  await grab();

  if (viteProc) viteProc.kill("SIGTERM");
}

async function main() {
  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  fs.rmSync(TMP_FRAMES, { recursive: true, force: true });
  fs.mkdirSync(TMP_FRAMES, { recursive: true });
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await runCapture(page);
  await browser.close();
  const { execFileSync } = await import("node:child_process");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      "1.5",
      "-i",
      path.join(TMP_FRAMES, "f%03d.png"),
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
  console.log("[ARTIFACT]", OUT_PNG);
  console.log("[ARTIFACT]", OUT_MP4);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
