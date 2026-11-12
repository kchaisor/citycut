#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { chromium } from "playwright";

const VIEWPORT = { width: 1440, height: 900 };
const CLIP = { x: 180, y: 100, width: 1080, height: 720 };
const ARTIFACTS = "/opt/cursor/artifacts";

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function vitePreview(port) {
  const child = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: path.resolve("."),
    stdio: "ignore",
  });
  return child;
}

async function waitForHttp(port, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/citycut/`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("preview timeout");
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const port = await freePort();
  const preview = vitePreview(port);
  await waitForHttp(port);
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const base = `http://127.0.0.1:${port}/citycut`;
  const url = `${base}/?qa=1&lat=-37.8045&lon=145.10658&km=0.5&label=Mont%20Albert%20North&view=persp`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("button.create-fab", { timeout: 60000 });
  await page.click("button.create-fab");
  await page.waitForSelector(".model", { timeout: 300000 });
  await page.locator('.model button[data-section="analysis"]').first().click();
  await page.evaluate(() =>
    document.querySelector("[data-sun-hours-ground-chip]")?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  await page.waitForFunction(() => document.documentElement.dataset.sunHoursDirectSurfacesReady === "1", null, {
    timeout: 600000,
  });
  await page.getByRole("tab", { name: /3D model/i }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /^Plan$/i }).click();
  await page.waitForFunction(() => document.documentElement.dataset.sunHoursDirectPlanView === "1", null, {
    timeout: 60000,
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__citycutQaModel?.frameSunHoursGroundPlan?.());
  await page.waitForTimeout(1200);
  const overview = path.join(ARTIFACTS, "sun-hours-mont-albert-3d-plan.png");
  await page.screenshot({ path: overview, clip: CLIP, animations: "disabled", scale: "css" });
  await page.evaluate(() => window.__citycutQaModel?.frameSunHoursGroundPlanCloseup?.());
  await page.waitForTimeout(900);
  const closeup = path.join(ARTIFACTS, "sun-hours-mont-albert-3d-plan-closeup.png");
  await page.screenshot({ path: closeup, clip: CLIP, animations: "disabled", scale: "css" });
  await browser.close();
  preview.kill("SIGTERM");
  console.log(JSON.stringify({ overview, closeup }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
