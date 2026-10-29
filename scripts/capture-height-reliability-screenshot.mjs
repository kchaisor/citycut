#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { chromium } from "playwright";

const OUT_3D = "/opt/cursor/artifacts/screenshots/data-reliability-3d.png";
const OUT_PLAN = "/opt/cursor/artifacts/screenshots/data-reliability-plan.png";

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

async function waitFor(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

fs.mkdirSync(path.dirname(OUT_3D), { recursive: true });

const port = await findFreePort();
const base = `http://127.0.0.1:${port}/citycut/`;
const vite = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", `--port`, String(port), "--strictPort"], {
  cwd: process.cwd(),
  stdio: "ignore",
});

try {
  await waitFor(base);
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}?lat=-37.8136&lon=144.9631&km=0.5&qa=1`, { waitUntil: "networkidle", timeout: 120000 });
  await page.evaluate(() => {
    localStorage.setItem("citycut.view3d.heightReliability", "1");
    localStorage.setItem("citycut.view3d.whiteCard", "0");
  });
  await page.getByRole("button", { name: /create model/i }).click({ timeout: 60000 });
  await page.waitForSelector(".model .viewport", { timeout: 120000 });
  await page.waitForSelector(".height-reliability-hud", { timeout: 120000 });
  await page.waitForTimeout(2000);
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT_3D, fullPage: false });
  await page.getByRole("tab", { name: /drawing/i }).click();
  await page.waitForSelector(".height-reliability-hud", { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT_PLAN, fullPage: false });
  await browser.close();
  console.log(`Saved ${OUT_3D} and ${OUT_PLAN}`);
} finally {
  vite.kill("SIGTERM");
}
