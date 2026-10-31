#!/usr/bin/env node
import { spawn } from "node:child_process";
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

  try {
    await waitForServer(baseUrl);
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      reducedMotion: "no-preference",
      recordVideo: { dir: OUT_DIR, size: VIEWPORT },
    });
    await context.addInitScript(() => {
      window.__citycutMinSilentLoadMs = 550;
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("button.create-fab", { timeout: 20000 });
    await page.click("button.create-fab");
    await page.waitForSelector(".model .scene-canvas canvas", { timeout: 120000 });
    await page.waitForTimeout(12000);
    await page.evaluate(() => {
      document.querySelector(".section-knife-toggle")?.click();
    });
    await page.waitForSelector(".section-knife-elevation", { timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(800);
    const shotViewport = path.join(OUT_DIR, "section-knife-viewport-1440x900.png");
    await page.screenshot({ path: shotViewport, fullPage: false });
    const panel = await page.$(".section-knife-elevation");
    if (panel) {
      await panel.screenshot({ path: path.join(OUT_DIR, "section-knife-panel-1440x900.png") });
    }
    console.log(`[ARTIFACT] ${shotViewport}`);
  } finally {
    await context.close();
    await browser.close();
    preview.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
