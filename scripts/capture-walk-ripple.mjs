#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { chromium } from "playwright";

const VIEWPORT = { width: 1440, height: 900 };
const OUT_MID = "/workspace/walk-ripple-mid-spread.png";
const OUT_FINAL = "/workspace/walk-ripple-final-bands.png";
const OUT_MP4 = "/workspace/walk-ripple-demo.mp4";
const TMP_FRAMES = "/tmp/walk_ripple_frames";

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
      // retry
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
      // try next
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
      // ignore
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
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.52;
  await page.mouse.click(cx, cy);
  await page.waitForFunction(() => Boolean(window.__citycutWalkRippleQa), { timeout: 30000 });
  await page.waitForTimeout(600);

  let frame = 0;
  const grab = async () => {
    await page.screenshot({ path: path.join(TMP_FRAMES, `f${String(frame++).padStart(3, "0")}.png`) });
  };

  await page.evaluate(() => window.__citycutWalkRippleQa?.setMinutes(7.5));
  await page.waitForTimeout(400);
  await grab();
  await page.screenshot({ path: OUT_MID, clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height } });

  await page.evaluate(() => window.__citycutWalkRippleQa?.setMinutes(16));
  await page.waitForTimeout(500);
  await grab();
  await page.screenshot({ path: OUT_FINAL, clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height } });

  for (const min of [2, 4, 6, 8, 10, 12, 14, 16]) {
    await page.evaluate((m) => window.__citycutWalkRippleQa?.setMinutes(m), min);
    await page.waitForTimeout(180);
    await grab();
  }

  if (viteProc) viteProc.kill("SIGTERM");
}

async function main() {
  fs.rmSync(TMP_FRAMES, { recursive: true, force: true });
  fs.mkdirSync(TMP_FRAMES, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
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
  console.log("[ARTIFACT]", OUT_MID);
  console.log("[ARTIFACT]", OUT_FINAL);
  console.log("[ARTIFACT]", OUT_MP4);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
