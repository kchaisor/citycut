#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { chromium } from "playwright";

const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };
const OUT_DIR = path.join(process.cwd(), "workspace-artifacts");

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

function waitForServer(url, timeoutMs = 30000) {
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
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const vite = spawn(path.join(process.cwd(), "node_modules/.bin/vite"), ["--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    stdio: "ignore",
    env: { ...process.env, BROWSER: "none" },
  });

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
  });

  try {
    await waitForServer(baseUrl);
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.addInitScript(() => {
      window.__citycutMinSilentLoadMs = 550;
    });
    await page.goto(baseUrl);
    const search = page.getByRole("combobox", { name: /Search a place/i });
    await search.fill("Mont Albert North");
    await page.waitForTimeout(350);
    await search.press("Enter");
    await page.waitForTimeout(1200);
    const kmBtn = page.getByRole("button", { name: /^1\.0\s*km$/i });
    if ((await kmBtn.count()) > 0) await kmBtn.click();
    await page.click("button.create-fab");
    await page.waitForSelector(".model canvas", { timeout: 120000 });
    await page.waitForTimeout(14000);
    await page.locator(".proj-btn.studio-submode-pill", { hasText: "Isometric" }).click();
    await page.waitForTimeout(700);
    await page.locator(".section-knife-toggle").click();
    await page.waitForSelector(".section-knife-elevation", { timeout: 20000 });
    await page.waitForTimeout(1600);
    const shot3d = path.join(OUT_DIR, "section-knife-mont-albert-north-3d-1440x900.png");
    const shotHud = path.join(OUT_DIR, "section-knife-mont-albert-north-hud-1440x900.png");
    await page.locator(".model canvas").screenshot({ path: shot3d });
    await page.locator(".section-knife-elevation").screenshot({ path: shotHud });
    console.log(`[ARTIFACT] ${shot3d}`);
    console.log(`[ARTIFACT] ${shotHud}`);
  } finally {
    await browser.close();
    vite.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
