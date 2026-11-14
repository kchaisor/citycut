import { spawn } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACTS = "/opt/cursor/artifacts";

const ROZELLE = { lat: -33.8677, lon: 151.1832, label: "Rozelle NSW", km: 1 };
const WIDTHS = [1024, 1280, 1440];
const HEIGHT = 800;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function waitForHttp(url, timeoutMs = 60_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {
        /* retry */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error(`Timed out waiting for ${url}`));
      setTimeout(poll, 250);
    };
    poll();
  });
}

fs.mkdirSync(ARTIFACTS, { recursive: true });

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}/citycut/`;
const preview = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: REPO_ROOT,
  stdio: "ignore",
});
await waitForHttp(baseUrl);

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(360_000);
const q = new URLSearchParams({
  lat: String(ROZELLE.lat),
  lon: String(ROZELLE.lon),
  label: ROZELLE.label,
  km: String(ROZELLE.km),
});
await page.goto(`${baseUrl}?${q.toString()}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForSelector("button.create-fab", { timeout: 30_000 });
await page.locator("button.create-fab").click({ timeout: 30_000 });
await page.waitForSelector(".model", { timeout: 360_000 });
await page.waitForFunction(
  () => {
    const left = document.querySelector(".model .top-bar-left");
    const center = document.querySelector(".model .top-bar-center");
    if (!left || !center) return false;
    const opacity = Number(getComputedStyle(left).opacity);
    return opacity > 0.9 && left.getBoundingClientRect().width > 0;
  },
  { timeout: 240_000 },
);
await page.waitForTimeout(1500);

for (const width of WIDTHS) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.waitForTimeout(300);
  await page.getByRole("tab", { name: "3D model" }).evaluate((el) => el.click());
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(ARTIFACTS, `topbar-3d-${width}.png`),
    clip: { x: 0, y: 0, width, height: 120 },
  });
  await page.getByRole("tab", { name: "Drawing" }).evaluate((el) => el.click());
  await page.waitForSelector("svg.plan", { timeout: 120_000 });
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(ARTIFACTS, `topbar-drawing-${width}.png`),
    clip: { x: 0, y: 0, width, height: 120 },
  });
}

await browser.close();
preview.kill("SIGTERM");
