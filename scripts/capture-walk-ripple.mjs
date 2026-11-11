#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { chromium } from "playwright";

const VIEWPORT = { width: 1440, height: 900 };
const OUT_4MIN = "/workspace/walk-ripple-scrubber-4min.png";
const OUT_12MIN = "/workspace/walk-ripple-scrubber-12min.png";
const OUT_MP4 = "/workspace/walk-ripple-scrubber-drag-replay.mp4";
const TMP_FRAMES = "/tmp/walk_ripple_scrubber_frames";

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

async function dragScrubberToPct(page, pct) {
  const track = page.locator(".model .walk-ripple-scrubber-track");
  const box = await track.boundingBox();
  if (!box) throw new Error("scrubber track missing");
  const x = box.x + box.width * pct;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 3, y);
  await page.mouse.up();
  await page.waitForTimeout(350);
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
  const remoteBase = process.env.CAPTURE_BASE_URL?.replace(/\/$/, "");
  let appBase;
  let viteProc = null;
  if (remoteBase) {
    appBase = await resolveAppBase(remoteBase);
    console.log("[capture-walk-ripple] remote base", appBase);
  } else {
    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    viteProc = spawn(
      path.join(process.cwd(), "node_modules/.bin/vite"),
      ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
      { cwd: process.cwd(), stdio: "ignore" },
    );
    console.log("[capture-walk-ripple] waiting for dev server…");
    await waitForServer(`${baseUrl}/citycut/`);
    appBase = `${baseUrl}/citycut/`;
  }

  const modelUrl = `${appBase}?lat=-37.8136&lon=144.9831&km=1&label=East%20Melbourne&qa=1`;
  await page.goto(modelUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
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
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Reset view" }).click({ timeout: 15000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const sideM = 1000;
    const d = sideM * 0.92;
    window.__citycutQa?.setCamera({
      eye: { x: d * 0.72, y: d * 0.78, z: -d * 0.72 },
      target: { x: 0, y: 25, z: 0 },
    });
  });
  await page.waitForTimeout(800);
  await page.locator('.model button[data-section="analysis"]').first().click();
  await page.waitForTimeout(400);
  await page.getByRole("tab", { name: /Walk Ripple/i }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Pick origin/i }).first().click();
  const canvas = page.locator(".model canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("No canvas");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.52);
  await page.waitForFunction(() => Boolean(window.__citycutWalkRippleQa), { timeout: 30000 });
  await page.waitForTimeout(900);

  let frame = 0;
  const grab = async () => {
    await page.screenshot({ path: path.join(TMP_FRAMES, `f${String(frame++).padStart(3, "0")}.png`) });
  };

  await dragScrubberToPct(page, 4 / 20);
  await grab();
  await page.screenshot({ path: OUT_4MIN, clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height } });

  await dragScrubberToPct(page, 12 / 20);
  await grab();
  await page.screenshot({ path: OUT_12MIN, clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height } });

  await page.getByRole("button", { name: /Replay walk ripple/i }).click();
  for (let i = 0; i < 28; i++) {
    await page.waitForTimeout(180);
    await grab();
  }

  if (viteProc) viteProc.kill("SIGTERM");
}

async function main() {
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
      "10",
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
  console.log("[ARTIFACT]", OUT_4MIN);
  console.log("[ARTIFACT]", OUT_12MIN);
  console.log("[ARTIFACT]", OUT_MP4);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
