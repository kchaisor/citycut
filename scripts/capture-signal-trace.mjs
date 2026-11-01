#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const VIEWPORT = { width: 1440, height: 900 };
const OUT_WIDE = "/workspace/signal-trace-box-hill-wide-1440x900.png";
const OUT_WIDE_ALIAS = "/workspace/signal-trace-box-hill-1440x900.png";
const OUT_CLOSE = "/workspace/signal-trace-box-hill-close-1440x900.png";
const OUT_MP4 = "/workspace/signal-trace-box-hill-orbit.mp4";
const TMP_FRAMES = "/tmp/signal_trace_frames";
const SIDE_M = 2400;
const FPS = 24;
const DURATION_SEC = 10;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => resolve(typeof addr === "object" && addr ? addr.port : 5199));
    });
    srv.on("error", reject);
  });
}

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
    }
    await new Promise((r) => setTimeout(r, 250));
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

async function canvasPulseDiff(page) {
  const shot = async () => {
    const dataUrl = await page.locator(".model .scene-canvas").screenshot({ type: "png" });
    return PNG.sync.read(dataUrl);
  };
  const a = await shot();
  await page.waitForTimeout(500);
  const b = await shot();
  let changed = 0;
  const n = Math.min(a.data.length, b.data.length);
  for (let i = 0; i < n; i += 4) {
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (dr + dg + db > 48) changed++;
  }
  return changed;
}

function frameWideCamera(sideM) {
  const d = sideM * 0.92;
  const h = sideM * 0.78;
  return {
    eye: { x: -d * 0.62, y: h, z: d * 0.62 },
    target: { x: 0, y: 0, z: 0 },
  };
}

async function runFlow(page) {
  await page.addInitScript(() => {
    window.__citycutQa = true;
    window.__citycutAwaitIntroStart = false;
    window.__citycutMinSilentLoadMs = 0;
    try {
      window.localStorage.setItem(
        "citycut.view",
        JSON.stringify({ projection: "perspective", corner: "sw", freeRotate: true }),
      );
      window.localStorage.setItem("citycut.view3d.look", "signalTrace");
      window.localStorage.setItem("citycut.sidebar.collapsed", "1");
    } catch {
    }
  });

  const remoteBase = process.env.CAPTURE_BASE_URL?.replace(/\/$/, "");
  let appBase;
  let viteProc = null;
  if (remoteBase) {
    appBase = await resolveAppBase(remoteBase);
    console.log("[capture-signal-trace] remote base", appBase);
  } else {
    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    viteProc = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)], {
      cwd: process.cwd(),
      stdio: "ignore",
    });
    await waitForServer(`${baseUrl}/citycut/`);
    appBase = `${baseUrl}/citycut/`;
  }

  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (text.includes("429") || text.includes("Failed to load resource")) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`${appBase}?qa=1&qaHidePopover=1`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByPlaceholder(/Search/i).fill("Box Hill VIC");
  await page.waitForTimeout(800);
  await page.getByRole("option").first().click({ timeout: 60000 });
  const sideInput = page.locator('input[type="range"]').first();
  await sideInput.evaluate((el, side) => {
    el.value = String(side);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, SIDE_M);
  await page.getByRole("button", { name: /Create model/i }).click();
  await page.waitForSelector(".model .scene-canvas", { timeout: 360000 });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    window.__citycutQaModel?.clearHeightSelection?.();
    const style = document.createElement("style");
    style.textContent =
      ".model .sidebar-panel,.model .left-outliner,.model .right-inspector,.model .building-detail-panel{display:none!important}";
    document.head.appendChild(style);
  });
  await page.waitForTimeout(600);

  await page.getByRole("tab", { name: /3D model/i }).click({ timeout: 15000 });
  await page.getByRole("button", { name: "10x", exact: true }).click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);

  await page.evaluate((sideM) => {
    const pose = {
      eye: { x: -sideM * 0.57, y: sideM * 0.78, z: sideM * 0.57 },
      target: { x: 0, y: 0, z: 0 },
    };
    window.__citycutQa?.setCamera(pose);
  }, SIDE_M);
  await page.waitForTimeout(1200);

  const canvas = page.locator(".model .scene-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas missing");
  const sourceId = await page.evaluate(() => window.__citycutQaModel?.pickForegroundBuildingForSelectionQa?.() ?? null);
  if (sourceId == null) throw new Error("No building to set as Signal Trace source");
  await page.evaluate((id) => window.__citycutSignalTraceQa?.pickBuilding(id), sourceId);
  await page.waitForTimeout(4500);

  const pulsePixels = await canvasPulseDiff(page);
  console.log("[capture-signal-trace] pulse pixel diff (500ms)", pulsePixels);
  if (pulsePixels < 800) {
    throw new Error(`Pulse motion too low: ${pulsePixels} changed pixels (need >= 800)`);
  }

  await page.screenshot({ path: OUT_WIDE, clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height } });
  fs.copyFileSync(OUT_WIDE, OUT_WIDE_ALIAS);

  await page.evaluate((sideM) => {
    const d = sideM * 0.28;
    window.__citycutQa?.setCamera({
      eye: { x: -d * 0.55, y: d * 0.95, z: d * 0.55 },
      target: { x: sideM * 0.04, y: 0, z: -sideM * 0.02 },
    });
  }, SIDE_M);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: OUT_CLOSE, clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height } });

  fs.rmSync(TMP_FRAMES, { recursive: true, force: true });
  fs.mkdirSync(TMP_FRAMES, { recursive: true });
  const frames = FPS * DURATION_SEC;
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    const angle = t * Math.PI * 0.9;
    await page.evaluate(
      ({ sideM, ang }) => {
        const d = sideM * (0.88 - 0.12 * Math.sin(ang));
        const h = sideM * (0.72 + 0.06 * Math.cos(ang * 0.5));
        window.__citycutQa?.setCamera({
          eye: { x: -Math.cos(ang) * d * 0.65, y: h, z: Math.sin(ang) * d * 0.65 },
          target: { x: 0, y: 0, z: 0 },
        });
      },
      { sideM: SIDE_M, ang: angle },
    );
    await page.waitForTimeout(1000 / FPS);
    await page.screenshot({
      path: `${TMP_FRAMES}/frame-${String(i).padStart(4, "0")}.png`,
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
    });
  }

  await new Promise((resolve, reject) => {
    const ff = spawn(
      "ffmpeg",
      ["-y", "-framerate", String(FPS), "-i", `${TMP_FRAMES}/frame-%04d.png`, "-pix_fmt", "yuv420p", OUT_MP4],
      { stdio: "inherit" },
    );
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
  });

  const frameMs = await page.evaluate(() => window.__signalTraceFrameUpdateMs ?? null);
  console.log("[capture-signal-trace] frame uniform update ms", frameMs);
  console.log("[capture-signal-trace] console errors", errors.length);
  if (errors.length > 0) {
    console.log(errors.slice(0, 10).join("\n"));
    process.exitCode = 1;
  }

  if (viteProc) viteProc.kill("SIGTERM");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: VIEWPORT });
try {
  await runFlow(page);
} finally {
  await browser.close();
}
