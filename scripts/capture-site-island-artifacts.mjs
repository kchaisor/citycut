#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { chromium } from "playwright";

const VIEWPORT = { width: 1440, height: 900 };
const OUT = "/workspace";

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

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {
      }
      if (Date.now() - start > timeoutMs) reject(new Error(`timeout ${url}`));
      else setTimeout(tick, 250);
    };
    tick();
  });
}

async function main() {
  const port = await findFreePort();
  const base = `http://127.0.0.1:${port}/citycut/`;
  const vite = spawn(
    path.join(process.cwd(), "node_modules/.bin/vite"),
    ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: process.cwd(), stdio: "inherit" },
  );
  await waitForServer(base);
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() =>
    chromium.launch({ headless: true }),
  );
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[console.error]", msg.text());
  });

  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("button.create-fab", { timeout: 20000 });
  const search = page.locator(".omnibox-input").first();
  await search.fill("Box Hill Victoria Australia");
  await page.waitForSelector(".landing-results button", { timeout: 60000 });
  await page.locator(".landing-results button").first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "1.0km" }).click();
  await page.waitForTimeout(300);
  await page.click("button.create-fab");
  await page.waitForSelector(".model canvas", { timeout: 240000 });
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector(".model canvas");
      return canvas && Number(canvas.dataset.introElapsed ?? 0) >= 3.4;
    },
    { timeout: 120000 },
  );
  await page.waitForTimeout(800);

  const analysisBtn = page.locator('.model button[data-section="analysis"]').first();
  await analysisBtn.click();
  await page.waitForTimeout(400);

  const island = page.locator(".model .site-island").first();
  await island.waitFor({ state: "visible", timeout: 15000 });
  await page.mouse.move(400, 400);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, "site-island-box-hill-collapsed.png") });

  const islandBox = await island.boundingBox();
  if (islandBox) {
    await page.mouse.move(islandBox.x + islandBox.width / 2, islandBox.y + islandBox.height / 2);
  }
  await page.waitForTimeout(320);
  await page.screenshot({ path: path.join(OUT, "site-island-box-hill-expanded.png") });

  const solarScrub = page.locator('.model .site-island input[aria-label="Solar time of day"]');
  await solarScrub.waitFor({ state: "visible", timeout: 10000 });
  const box = await solarScrub.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5);
    await page.mouse.down();
    for (let i = 0; i <= 24; i++) {
      await page.mouse.move(box.x + (box.width * i) / 24, box.y + box.height * 0.5);
      await page.waitForTimeout(35);
    }
    await page.mouse.up();
  }
  await page.waitForTimeout(200);

  const framesDir = "/tmp/site-island-video-frames";
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  for (let f = 0; f < 50; f++) {
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(framesDir, `f_${String(f).padStart(3, "0")}.png`) });
  }

  spawnSync(
    "ffmpeg",
    ["-y", "-framerate", "5", "-i", path.join(framesDir, "f_%03d.png"), "-pix_fmt", "yuv420p", path.join(OUT, "site-island-box-hill-demo.mp4")],
    { stdio: "inherit" },
  );

  await page.getByRole("tab", { name: /Walk Ripple/i }).click();
  await page.waitForTimeout(300);
  if (islandBox) {
    await page.mouse.move(islandBox.x + islandBox.width / 2, islandBox.y + islandBox.height / 2);
  }
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Pick origin/i }).first().click();
  const canvas = page.locator(".model canvas").first();
  const cbox = await canvas.boundingBox();
  if (cbox) {
    await page.mouse.click(cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.52);
  }
  await page.waitForFunction(
    () => {
      const track = document.querySelector(".model .walk-ripple-scrubber-track");
      return track && track.getAttribute("aria-disabled") === "false";
    },
    { timeout: 120000 },
  );

  await browser.close();
  vite.kill("SIGTERM");
  console.log("Wrote site-island-box-hill-*.png and site-island-box-hill-demo.mp4");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
