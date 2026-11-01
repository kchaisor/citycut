import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { chromium } from "playwright";

const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };
const CHROME_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--disable-dev-shm-usage",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--no-sandbox",
];

const BOX_HILL = {
  id: "box-hill",
  label: "Box Hill VIC",
  lat: -37.8187756,
  lon: 145.1266505,
  km: 1,
};

const SCENARIOS = [
  { id: "baseline-183", overrides: { aoOffWhileMoving: true, dprDropWhileOrbiting: true } },
  { id: "ao-steady", overrides: { dprDropWhileOrbiting: true } },
  { id: "dpr-steady", overrides: { aoOffWhileMoving: true } },
  { id: "frameloop-always", overrides: { aoOffWhileMoving: true, dprDropWhileOrbiting: true, frameloopAlways: true } },
  { id: "fix-all", overrides: {} },
];

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 4173;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          resolve();
          return;
        }
      } catch {
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(check, 250);
    };
    check();
  });
}

async function startPreview(port, basePath) {
  const proc = spawn(
    path.join(process.cwd(), "node_modules/.bin/vite"),
    ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: basePath ?? process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BROWSER: "none" } },
  );
  const baseUrl = `http://127.0.0.1:${port}/citycut/`;
  await waitForServer(baseUrl);
  return { proc, baseUrl };
}

async function waitIntroDone(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const done = () => resolve(undefined);
        window.addEventListener("citycut:intro-done", done, { once: true });
        setTimeout(done, 45000);
      }),
  );
}

async function waitForWebGlCanvas(page) {
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector(".model canvas");
      return Boolean(canvas && canvas.width > 800 && canvas.height > 500);
    },
    { timeout: 120000 },
  );
}

async function openBoxHillHigh(page, baseUrl, overrides) {
  await page.addInitScript((ov) => {
    window.localStorage.setItem("citycut.view3d.quality", "high");
    window.__citycutMinSilentLoadMs = 0;
    window.__citycutPerfOverrides = ov ?? null;
  }, overrides);
  const site = BOX_HILL;
  const url = `${baseUrl}?qa=1&view=persp&lat=${site.lat}&lon=${site.lon}&km=${site.km}&label=${encodeURIComponent(site.label)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model", { timeout: 600000 });
  await waitForWebGlCanvas(page);
  await waitIntroDone(page);
  await page.waitForTimeout(2000);
  await page.evaluate((ov) => {
    window.__citycutPerfOverrides = ov ?? null;
    window.__citycutPerf?.setOverrides?.(ov ?? null);
  }, overrides);
  await page.waitForTimeout(500);
}

async function measureSlowOrbitFlicker(page, opts) {
  const canvas = page.locator(".model canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas box");
  const cx = box.x + box.width * 0.55;
  const cy = box.y + box.height * 0.45;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const steps = opts?.steps ?? 40;
  const dx = (box.width * 0.32) / steps;
  const diffs = [];
  let prevPixels = null;
  for (let i = 0; i < steps; i++) {
    await page.mouse.move(cx + dx * (i + 1), cy + Math.sin(i / 5) * 3, { steps: 3 });
    await page.waitForTimeout(opts?.stepMs ?? 90);
    const sample = await page.evaluate(() => {
      const canvasEl = document.querySelector(".model canvas");
      if (!canvasEl) return null;
      const thumbW = 180;
      const thumbH = 112;
      const off = document.createElement("canvas");
      off.width = thumbW;
      off.height = thumbH;
      const ctx = off.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(canvasEl, 0, 0, thumbW, thumbH);
      return Array.from(ctx.getImageData(0, 0, thumbW, thumbH).data);
    });
    if (sample && prevPixels) {
      let sum = 0;
      let n = 0;
      for (let p = 0; p < sample.length; p += 4) {
        sum +=
          Math.abs(sample[p] - prevPixels[p]) +
          Math.abs(sample[p + 1] - prevPixels[p + 1]) +
          Math.abs(sample[p + 2] - prevPixels[p + 2]);
        n += 3;
      }
      diffs.push(n ? sum / n : 0);
    }
    if (sample) prevPixels = sample;
  }
  await page.mouse.up();
  const sorted = [...diffs].sort((a, b) => a - b);
  const sum = diffs.reduce((a, b) => a + b, 0);
  const p = (pct) => {
    if (!sorted.length) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
    return sorted[idx];
  };
  const canvasPixelRatio = await page.evaluate(() => {
    const canvasEl = document.querySelector(".model canvas");
    if (!canvasEl) return null;
    const rect = canvasEl.getBoundingClientRect();
    return canvasEl.width / Math.max(1, rect.width);
  });
  return {
    frames: diffs.length,
    meanDiff: diffs.length ? sum / diffs.length : 0,
    p95Diff: p(95),
    maxDiff: sorted.length ? sorted[sorted.length - 1] : 0,
    canvasPixelRatio,
  };
}

async function runScenario(baseUrl, scenario) {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: CHROME_ARGS,
  });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    await openBoxHillHigh(page, baseUrl, scenario.overrides);
    const qaSummary = await page.evaluate(() => window.__citycutQaModel?.getSummary?.() ?? null);
    const flicker = await measureSlowOrbitFlicker(page);
    await context.close();
    return { ...scenario, flicker, qaSummary };
  } finally {
    await browser.close();
  }
}

function parseArgs(argv) {
  const out = { baseUrl: null, outDir: "/opt/cursor/artifacts", cwd: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") out.baseUrl = argv[++i];
    else if (arg === "--out") out.outDir = argv[++i];
    else if (arg === "--cwd") out.cwd = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.outDir, { recursive: true });
  let proc = null;
  let baseUrl = args.baseUrl;
  if (!baseUrl) {
    const port = await findFreePort();
    const preview = await startPreview(port, args.cwd);
    proc = preview.proc;
    baseUrl = preview.baseUrl;
  }
  const results = [];
  try {
    for (const scenario of SCENARIOS) {
      console.log(`[flicker] ${scenario.id}`);
      const row = await runScenario(baseUrl, scenario);
      results.push(row);
      console.log(JSON.stringify({ id: scenario.id, flicker: row.flicker }, null, 2));
    }
  } finally {
    proc?.kill("SIGTERM");
  }
  const outPath = path.join(args.outDir, "orbit-flicker-diagnosis.json");
  fs.writeFileSync(outPath, JSON.stringify({ baseUrl, site: BOX_HILL, results }, null, 2));
  console.log("Wrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
