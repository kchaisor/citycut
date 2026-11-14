#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { chromium } from "playwright";
import { groundWindDrawnWindows } from "./ground-wind-windows-lib.mjs";
import { PNG } from "pngjs";

const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 2;
const RUNS = Number(process.env.GROUND_WIND_RUNS ?? 5);
const CLEELAND_PATH =
  "/citycut/?lat=-37.983826&lon=145.21555&label=40+Cleeland+St%2C+Dandenong+VIC+3175&km=1&debug=wind";

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 5188;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForServer(url, timeoutMs = 120000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {}
      if (Date.now() - start > timeoutMs) reject(new Error(`timeout ${url}`));
      else setTimeout(tick, 250);
    };
    tick();
  });
}

async function runWindAudit(page, baseURL) {
  await page.goto(baseURL + CLEELAND_PATH, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector("button.create-fab", { timeout: 120000 });
  await page.click("button.create-fab");
  await page.waitForSelector(".model", { timeout: 600000 });
  await page.waitForFunction(
    () => {
      const model = document.querySelector("div.model");
      return model && !model.hasAttribute("data-intro-hold");
    },
    undefined,
    { timeout: 300000 },
  );
  await page.waitForTimeout(800);
  const analysisBtn = page.locator('.model button[data-section="analysis"]').first();
  await analysisBtn.click({ force: true });
  await page.waitForTimeout(400);
  await page.getByRole("tab", { name: /Wind Rose/i }).click();
  const windChip = page.locator("button.ov-chip", { hasText: "3D Wind Flow" }).first();
  await windChip.waitFor({ state: "visible", timeout: 60000 });
  if ((await windChip.getAttribute("aria-pressed")) !== "true") await windChip.click();
  await page.waitForTimeout(12000);
  const jsAudit = await page.evaluate(() => {
    const fn = window.__citycutGroundWindAudit;
    if (!fn) return null;
    const snap = fn();
    const se = snap?.seDrawn;
    return {
      coverage: snap?.coverageRatio ?? 0,
      drawable: snap?.drawable ?? 0,
      seLeft: se?.x600_800?.groundNormalisedLength ?? 0,
      seRight: se?.x800_1000?.groundNormalisedLength ?? 0,
      seLeftSeg: se?.x600_800?.drawnSegments ?? 0,
      seRightSeg: se?.x800_1000?.drawnSegments ?? 0,
      mpp: (window).__citycutGroundWindMpp ?? null,
    };
  });
  const shot = await page.screenshot({ type: "png" });
  const frame = PNG.sync.read(shot);
  const pixAudit = groundWindDrawnWindows(frame.data, frame.width, frame.height, DEVICE_SCALE_FACTOR, {
    minGround: 0.15,
    minRatio: 0.35,
    minYCssPx: 300,
  });
  const seQuarter = pixAudit.windows.filter((w) => w.x0 >= 720 && w.y0 >= 450);
  const seBand = pixAudit.windows.filter((w) => w.x0 >= 800 && w.x0 < 1000 && w.y0 >= 300 && w.y0 < 600);
  const pickWorst = (list) => list.reduce((a, w) => (a === null || w.ratio < a.ratio ? w : a), null);
  return {
    jsAudit,
    pixAudit: {
      ok: pixAudit.ok,
      failing: pixAudit.failing.length,
      worst: pixAudit.worst,
      seQuarterWorst: pickWorst(seQuarter),
      seBandWorst: pickWorst(seBand),
    },
  };
}

async function main() {
  const port = await findFreePort();
  const baseURL = `http://127.0.0.1:${port}`;
  const repo = path.resolve(import.meta.dirname, "..");
  const vite = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: repo,
    stdio: "pipe",
    env: { ...process.env },
  });
  await waitForServer(`${baseURL}/citycut/`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const results = [];
  try {
    for (let i = 0; i < RUNS; i++) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
        baseURL,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(120000);
      const row = await runWindAudit(page, baseURL);
      results.push(row);
      console.log(
        JSON.stringify({
          run: i + 1,
          ...row.jsAudit,
          pixOk: row.pixAudit.ok,
          pixFailing: row.pixAudit.failing,
          seQuarterWorst: row.pixAudit.seQuarterWorst,
          seBandWorst: row.pixAudit.seBandWorst,
          worst: row.pixAudit.worst,
        }),
      );
      await context.close();
    }
  } finally {
    await browser.close();
    vite.kill();
  }
  const pass = results.every(
    (r) =>
      (r.jsAudit?.seRight ?? 0) > 0 &&
      (r.pixAudit.seBandWorst?.ratio ?? 0) >= 0.35 &&
      (r.pixAudit.seQuarterWorst?.ratio ?? 0) >= 0.35,
  );
  console.log(`SUMMARY runs=${RUNS} allPass=${pass}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});