#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import { chromium } from "playwright";

const VIEWPORT = { width: 1440, height: 900 };
const OUT_PNG = "/workspace/signal-trace-box-hill-1440x900.png";
const OUT_MP4 = "/workspace/signal-trace-box-hill-orbit.mp4";
const TMP_FRAMES = "/tmp/signal_trace_frames";
const SIDE_M = 2400;

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
    if (text.includes("429")) return;
    if (text.includes("Failed to load resource")) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.goto(`${appBase}?qa=1`, { waitUntil: "domcontentloaded", timeout: 120000 });
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
  await page.waitForTimeout(4000);

  await page.getByRole("tab", { name: /3D model/i }).click({ timeout: 15000 });
  await page.getByRole("button", { name: "Display" }).first().click({ timeout: 15000 });
  await page.getByRole("button", { name: "Signal Trace" }).click({ timeout: 15000 });
  await page.waitForTimeout(1500);

  const canvas = page.locator(".scene-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas missing");
  const cx = box.x + box.width * 0.52;
  const cy = box.y + box.height * 0.48;
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(2500);

  await page.screenshot({ path: OUT_PNG });

  fs.rmSync(TMP_FRAMES, { recursive: true, force: true });
  fs.mkdirSync(TMP_FRAMES, { recursive: true });
  const frames = 120;
  for (let i = 0; i < frames; i++) {
    const angle = (i / frames) * Math.PI * 0.55;
    const ox = Math.cos(angle) * box.width * 0.12;
    const oy = Math.sin(angle) * box.height * 0.06;
    await page.mouse.move(cx + ox, cy + oy);
    if (i % 8 === 0) await page.mouse.down({ button: "left" });
    if (i % 8 === 4) await page.mouse.up({ button: "left" });
    await page.waitForTimeout(80);
    await page.screenshot({ path: `${TMP_FRAMES}/frame-${String(i).padStart(4, "0")}.png` });
  }

  await new Promise((resolve, reject) => {
    const ff = spawn(
      "ffmpeg",
      ["-y", "-framerate", "12", "-i", `${TMP_FRAMES}/frame-%04d.png`, "-pix_fmt", "yuv420p", OUT_MP4],
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
