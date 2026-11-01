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

const SITES = [
  { id: "melbourne-cbd", label: "Melbourne CBD", lat: -37.8136, lon: 144.9631, km: 0.5 },
  { id: "dandenong", label: "Dandenong VIC", lat: -37.98382, lon: 145.21555, km: 1.15 },
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

async function startPreview(port) {
  const proc = spawn(
    path.join(process.cwd(), "node_modules/.bin/vite"),
    ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BROWSER: "none" } },
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

async function openPerspectiveModel(page, baseUrl, site, initHooks) {
  await page.addInitScript((hooks) => {
    window.localStorage.setItem("citycut.view3d.quality", hooks.quality ?? "high");
    window.__citycutMinSilentLoadMs = 0;
    window.__citycutPerfOverrides = null;
  }, initHooks);
  const url = `${baseUrl}?qa=1&view=persp&lat=${site.lat}&lon=${site.lon}&km=${site.km}&label=${encodeURIComponent(site.label)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model", { timeout: 600000 });
  await waitForWebGlCanvas(page);
  await waitIntroDone(page);
  await page.waitForTimeout(1500);
  if (initHooks.quality === "fast") {
    const fast = page.getByRole("button", { name: "Fast", exact: true });
    if (await fast.count()) await fast.click();
  }
  if (initHooks.castShadows) {
    const shadow = page.locator(".sun-pill.studio-solar-pill").first();
    if (await shadow.count()) await shadow.click();
  }
  if (initHooks.overrides) {
    await page.evaluate((overrides) => {
      window.__citycutPerfOverrides = overrides;
      window.__citycutPerf?.setOverrides?.(overrides);
    }, initHooks.overrides);
    await page.waitForTimeout(400);
  }
}

function summarizeDeltas(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const pct = (p) => {
    if (!sorted.length) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
  };
  return {
    frames: sorted.length,
    fpsAvg: sorted.length ? Math.round((1000 * sorted.length) / sum) : 0,
    frameMsAvg: sorted.length ? sum / sorted.length : 0,
    frameMsP50: pct(50),
    frameMsP95: pct(95),
    frameMsP99: pct(99),
  };
}

async function samplePerf(page, mode, durationMs) {
  const hasR3f = await page.evaluate(() => Boolean(window.__citycutPerf?.startSample));
  if (hasR3f) {
    await page.evaluate(
      ({ mode: m, durationMs: ms }) => {
        window.__citycutPerf.startSample({ durationMs: ms, orbit: m === "orbit" });
      },
      { mode, durationMs },
    );
    const deadline = Date.now() + durationMs + 3000;
    let stats = null;
    while (Date.now() < deadline) {
      await page.waitForTimeout(16);
      stats = await page.evaluate(() => window.__citycutPerf?.readSample?.() ?? null);
      if (stats) break;
    }
    const renderer = await page.evaluate(() => window.__citycutPerf?.getRendererSnapshot?.() ?? null);
    return { stats: stats ?? summarizeDeltas([]), renderer, source: "r3f" };
  }
  const samples = [];
  let orbitAngle = 0;
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    const t0 = Date.now();
    if (mode === "orbit") {
      orbitAngle += 0.012;
      await page.evaluate((angle) => {
        const basePose = window.__citycutQa?.getCamera?.();
        if (!basePose || !window.__citycutQa?.setCamera) return;
        const { eye, target } = basePose;
        const dx = eye.x - target.x;
        const dz = eye.z - target.z;
        const dist = Math.hypot(dx, dz) || 500;
        const ang = Math.atan2(dz, dx) + angle;
        window.__citycutQa.setCamera({
          eye: {
            x: target.x + Math.cos(ang) * dist * 1.15,
            y: eye.y,
            z: target.z + Math.sin(ang) * dist * 1.15,
          },
          target,
        });
      }, orbitAngle);
    }
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    samples.push(Date.now() - t0);
  }
  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector(".model canvas");
    const rect = canvas?.getBoundingClientRect();
    return canvas
      ? {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          canvasClientWidth: rect?.width ?? 0,
          canvasClientHeight: rect?.height ?? 0,
          canvasPixelRatio: canvas.width / Math.max(1, rect?.width ?? 1),
          devicePixelRatio: window.devicePixelRatio,
        }
      : null;
  });
  return { source: "raf", stats: summarizeDeltas(samples), renderer };
}

async function getGpuInfo(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".model canvas") ?? document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!gl) return { error: "no-webgl" };
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
  });
}

async function runScenario({ buildLabel, toggles, outDir }) {
  const port = await findFreePort();
  const { proc, baseUrl } = await startPreview(port);
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: CHROME_ARGS,
  });
  const row = { buildLabel, toggles, sites: {}, gpu: null };
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(180000);

    for (const site of SITES) {
      await openPerspectiveModel(page, baseUrl, site, toggles);
      if (!row.gpu) row.gpu = await getGpuInfo(page);
      const idle = await samplePerf(page, "idle", 4000);
      const orbit = await samplePerf(page, "orbit", 4000);
      const qaSummary = await page.evaluate(() => window.__citycutQaModel?.getSummary?.() ?? null);
      row.sites[site.id] = { idle, orbit, qaSummary };
      if (toggles.screenshot) {
        const shot = path.join(outDir, `${buildLabel}-${site.id}-${toggles.screenshot}.png`);
        await page.screenshot({ path: shot });
        row.sites[site.id].screenshot = shot;
      }
    }
    await context.close();
  } finally {
    await browser.close();
    proc.kill("SIGTERM");
  }
  return row;
}

function parseArgs(argv) {
  const out = { buildLabel: "main", toggles: {}, outDir: "/opt/cursor/artifacts", scenarios: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--label") out.buildLabel = argv[++i];
    else if (arg === "--out") out.outDir = argv[++i];
    else if (arg === "--scenario") out.scenarios = JSON.parse(argv[++i]);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.outDir, { recursive: true });

  const defaultScenarios = [
    { name: "baseline-high", toggles: { quality: "high" } },
    { name: "quality-fast", toggles: { quality: "fast" } },
    { name: "no-post", toggles: { quality: "high", overrides: { disablePost: true } } },
    { name: "shadows-on", toggles: { quality: "high", castShadows: true } },
    { name: "dpr-1", toggles: { quality: "high", overrides: { dprCap: 1 } } },
    { name: "trees-off", toggles: { quality: "high", overrides: { treesOff: true } } },
  ];

  const scenarios = args.scenarios ?? defaultScenarios;
  const all = [];
  for (const scenario of scenarios) {
    console.log(`[bench] ${args.buildLabel} :: ${scenario.name}`);
    const result = await runScenario({
      buildLabel: `${args.buildLabel}-${scenario.name}`,
      toggles: { ...scenario.toggles, scenarioName: scenario.name },
      outDir: args.outDir,
    });
    all.push({ name: scenario.name, result });
    console.log(JSON.stringify({ scenario: scenario.name, melbourne: result.sites["melbourne-cbd"]?.idle?.stats, gpu: result.gpu }, null, 2));
  }

  const outPath = path.join(args.outDir, `bench-3d-${args.buildLabel}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ buildLabel: args.buildLabel, gpu: all[0]?.result?.gpu, scenarios: all }, null, 2));
  console.log("Wrote", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
