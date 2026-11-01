#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { chromium } from "playwright";

const VIEWPORT = { width: 1440, height: 900 };
const OUT_PNG = "/opt/cursor/artifacts/walk-ripple-rival-origins-box-hill-wide.png";
const OUT_MP4 = "/opt/cursor/artifacts/walk-ripple-rival-origins-box-hill-wide.mp4";
const TMP_FRAMES = "/tmp/walk_ripple_rival_frames";

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

async function waitOriginCount(page, min) {
  await page.waitForFunction((n) => (window.__citycutWalkRippleQa?.getOriginCount?.() ?? 0) >= n, min, {
    timeout: 180000,
  });
}

async function shiftClickOrigin(page, box, px, py) {
  await page.keyboard.down("Shift");
  await page.mouse.click(box.x + box.width * px, box.y + box.height * py);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(500);
}

async function main() {
  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  fs.rmSync(TMP_FRAMES, { recursive: true, force: true });
  fs.mkdirSync(TMP_FRAMES, { recursive: true });

  const remoteBase = process.env.CAPTURE_BASE_URL?.replace(/\/$/, "");
  let appBase;
  let viteProc = null;
  if (remoteBase) {
    appBase = await resolveAppBase(remoteBase);
    console.log("[rival-origins] remote base", appBase);
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

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.setDefaultTimeout(240000);

  await page.addInitScript(() => {
    window.__citycutAwaitIntroStart = true;
    window.__citycutMinSilentLoadMs = 0;
    try {
      window.localStorage.setItem(
        "citycut.view",
        JSON.stringify({ projection: "perspective", corner: "sw", freeRotate: false }),
      );
    } catch {
    }
  });

  const modelUrl = `${appBase}?lat=-37.8186&lon=145.1235&km=2&label=Box%20Hill%20VIC&qa=1`;
  await page.goto(modelUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Create model/i }).click();
  await page.waitForSelector(".model canvas", { timeout: 180000 });
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector(".model canvas");
      return canvas && canvas.dataset.camKind === "perspective";
    },
    { timeout: 120000 },
  );
  await page.getByRole("button", { name: "Reset view" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Reset view" }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const sideM = 2000;
    const d = sideM * 0.88;
    window.__citycutQa?.setCamera({
      eye: { x: d * 0.68, y: d * 0.72, z: -d * 0.68 },
      target: { x: 0, y: 30, z: 0 },
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
  await page.mouse.click(box.x + box.width * 0.44, box.y + box.height * 0.55);
  await page.waitForFunction(() => Boolean(window.__citycutWalkRippleQa), { timeout: 120000 });
  await waitOriginCount(page, 1);

  await shiftClickOrigin(page, box, 0.58, 0.48);
  let count = await page.evaluate(() => window.__citycutWalkRippleQa?.getOriginCount?.() ?? 0);
  if (count < 2) {
    await page.evaluate(() => window.__citycutWalkRippleQa?.addOriginAt?.(420, -180));
  }
  await waitOriginCount(page, 2);

  await shiftClickOrigin(page, box, 0.52, 0.62);
  count = await page.evaluate(() => window.__citycutWalkRippleQa?.getOriginCount?.() ?? 0);
  if (count < 3) {
    await page.evaluate(() => window.__citycutWalkRippleQa?.addOriginAt?.(-260, 320));
  }
  await waitOriginCount(page, 3);
  await page.waitForTimeout(1500);

  const workerMs = await page.evaluate(() => window.__citycutWalkRippleQa?.getWorkerMs?.() ?? null);
  console.log("[rival-origins] workerMs", workerMs, "origins", 3);

  const markerDrag = async () => {
    const midX = box.x + box.width * 0.5;
    const midY = box.y + box.height * 0.52;
    await page.mouse.move(midX, midY);
    await page.mouse.down();
    await page.mouse.move(midX + 48, midY - 22, { steps: 12 });
    await page.mouse.up();
  };

  let frame = 0;
  const grab = async () => {
    const p = path.join(TMP_FRAMES, `f${String(frame++).padStart(3, "0")}.png`);
    await page.screenshot({ path: p });
  };

  await grab();
  await markerDrag();
  await page.waitForTimeout(1800);
  await grab();
  await page.getByRole("button", { name: /Replay walk ripple/i }).click();
  for (let i = 0; i < 55; i++) {
    await page.waitForTimeout(180);
    await grab();
  }

  await page.screenshot({
    path: OUT_PNG,
    clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
  });

  const { spawnSync } = await import("node:child_process");
  const fps = 10;
  const enc = spawnSync(
    "ffmpeg",
    ["-y", "-framerate", String(fps), "-i", path.join(TMP_FRAMES, "f%03d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", OUT_MP4],
    { stdio: "inherit" },
  );
  if (enc.status !== 0) throw new Error("ffmpeg failed");

  await browser.close();
  if (viteProc) viteProc.kill("SIGTERM");
  console.log("[rival-origins] wrote", OUT_PNG, OUT_MP4);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
