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

async function main() {
  fs.rmSync(TMP_FRAMES, { recursive: true, force: true });
  fs.mkdirSync(TMP_FRAMES, { recursive: true });
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const viteProc = spawn(
    path.join(process.cwd(), "node_modules/.bin/vite"),
    ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: process.cwd(), stdio: "ignore" },
  );
  console.log("[capture-walk-ripple] waiting for dev server…");
  await waitForServer(`${baseUrl}/citycut/`);
  console.log("[capture-walk-ripple] server up");
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    window.__citycutAwaitIntroStart = true;
    window.__citycutMinSilentLoadMs = 0;
  });
  const modelUrl = `${baseUrl}/citycut/?lat=-37.8136&lon=144.9831&km=1&label=East%20Melbourne&qa=1&buildings=uniform`;
  await page.goto(modelUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByRole("button", { name: /Create model/i }).click({ timeout: 120000 });
  await page.waitForSelector(".model canvas", { timeout: 180000 });
  await page.waitForTimeout(2000);
  await page.locator('.model button[data-section="analysis"]').first().click();
  await page.waitForTimeout(400);
  await page.getByRole("tab", { name: /Walk Ripple/i }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Pick origin/i }).first().click();
  const canvas = page.locator(".model canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("No canvas");
  const cx = box.x + box.width * 0.52;
  const cy = box.y + box.height * 0.54;
  let frame = 0;
  const grab = async () => {
    await page.screenshot({ path: path.join(TMP_FRAMES, `f${String(frame++).padStart(3, "0")}.png`) });
  };
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(900);
  await grab();
  await page.screenshot({ path: OUT_MID });
  await page.waitForTimeout(3200);
  await grab();
  await page.screenshot({ path: OUT_FINAL });
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(120);
    await grab();
  }
  await browser.close();
  viteProc.kill("SIGTERM");
  const { execFileSync } = await import("node:child_process");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      "12",
      "-i",
      path.join(TMP_FRAMES, "f%03d.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "20",
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
