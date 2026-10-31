#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { chromium } from "playwright";

const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };
const OUT_DIR = "/workspace";

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => resolve(typeof addr === "object" && addr ? addr.port : 4173));
    });
    srv.on("error", reject);
  });
}

function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {
        // retry
      }
      if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ${url}`));
      else setTimeout(check, 200);
    };
    check();
  });
}

async function main() {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const viteBin = path.join(process.cwd(), "node_modules/.bin/vite");
  const preview = spawn(viteBin, ["--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "ignore",
    env: { ...process.env, BROWSER: "none" },
  });

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ],
  });

  const frameDir = "/tmp/citycut-section-knife-frames";
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.mkdirSync(frameDir, { recursive: true });
  try {
    await waitForServer(baseUrl);
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      reducedMotion: "no-preference",
    });
    await context.addInitScript(() => {
      window.__citycutMinSilentLoadMs = 550;
    });
    const page = await context.newPage();
    page.on("pageerror", (err) => console.error("[PAGEERROR]", err.message));

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("button.create-fab", { timeout: 20000 });
    await page.click("button.create-fab");
    await page.waitForSelector(".model .scene-canvas canvas", { timeout: 120000 });
    await page.waitForTimeout(14000);
    await page.locator(".proj-btn.studio-submode-pill", { hasText: "Isometric" }).click();
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      document.querySelector(".section-knife-toggle")?.click();
    });
    await page.waitForSelector(".section-knife-elevation", { timeout: 15000 });
    await page.waitForTimeout(1500);

    const shotViewport = path.join(OUT_DIR, "section-knife-viewport-1440x900.png");
    await page.screenshot({ path: shotViewport, fullPage: false });
    const panel = await page.$(".section-knife-elevation");
    if (panel) {
      await panel.screenshot({ path: path.join(OUT_DIR, "section-knife-panel-1440x900.png") });
    }
    console.log(`[ARTIFACT] ${shotViewport}`);

    const canvas = page.locator(".scene-canvas canvas");
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width * 0.55;
      const cy = box.y + box.height * 0.45;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 0; i < 16; i++) {
        await page.mouse.move(cx - i * 9, cy + i * 2, { steps: 2 });
        await page.waitForTimeout(70);
        await page.screenshot({ path: path.join(frameDir, `frame-${String(i).padStart(3, "0")}.png`) });
      }
      await page.mouse.up();
    }
    await page.waitForTimeout(200);
    await context.close();
  } finally {
    await browser.close();
    preview.kill("SIGTERM");
  }

  const mp4 = path.join(OUT_DIR, "section-knife-drag-demo.mp4");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      "12",
      "-i",
      path.join(frameDir, "frame-%03d.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4,
    ],
    { stdio: "ignore" },
  );
  console.log(`[ARTIFACT] ${mp4}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
