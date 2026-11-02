import { spawn } from "node:child_process";
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

const SITE = { lat: -37.8136, lon: 144.9831, km: 1, label: "East Melbourne" };
const MAIN_URL = process.env.CITYCUT_MAIN_URL ?? "https://kchaisor.github.io/citycut/";
const BRANCH_PREVIEW_URL =
  process.env.CITYCUT_PREVIEW_URL ?? process.env.VERIFY_BASE_URL ?? null;

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

async function startLocalPreview() {
  const port = await findFreePort();
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
        window.addEventListener("citycut:intro-done", done, { once: true });
        function done() {
          resolve(undefined);
        }
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
    { timeout: 180000 },
  );
}

async function settleDefaultCamera(page) {
  const reset = page.getByRole("button", { name: "Reset view" });
  await reset.click({ timeout: 60000 });
  await page.waitForTimeout(600);
  await reset.click({ timeout: 60000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const d = 920;
    window.__citycutQa?.setCamera?.({
      eye: { x: d * 0.72, y: d * 0.78, z: -d * 0.72 },
      target: { x: 0, y: 25, z: 0 },
    });
  });
  await page.waitForTimeout(800);
}

async function openModel(page, baseUrl) {
  await page.addInitScript(() => {
    window.localStorage.setItem("citycut.view3d.quality", "high");
    window.__citycutMinSilentLoadMs = 0;
    window.__citycutPerfOverrides = null;
    try {
      window.localStorage.setItem(
        "citycut.view",
        JSON.stringify({ projection: "perspective", corner: "sw", freeRotate: false }),
      );
    } catch {
    }
  });
  const url = `${baseUrl}?qa=1&view=persp&lat=${SITE.lat}&lon=${SITE.lon}&km=${SITE.km}&label=${encodeURIComponent(SITE.label)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model", { timeout: 600000 });
  await waitForWebGlCanvas(page);
  await waitIntroDone(page);
  await settleDefaultCamera(page);
  const highBtn = page.getByRole("button", { name: "High", exact: true });
  if (await highBtn.count()) await highBtn.click();
  await page.waitForTimeout(400);
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

async function mouseOrbitSample(page, durationMs) {
  const canvas = page.locator(".model canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas");
  const cx = box.x + box.width * 0.55;
  const cy = box.y + box.height * 0.48;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const hasPerf = await page.evaluate(() => Boolean(window.__citycutPerf?.startSample));
  if (hasPerf) {
    await page.evaluate((ms) => window.__citycutPerf.startSample({ durationMs: ms, orbit: false }), durationMs + 2000);
  }
  const steps = Math.max(36, Math.round(durationMs / 65));
  const dx = (box.width * 0.34) / steps;
  const rafSamples = [];
  for (let i = 0; i < steps; i++) {
    await page.mouse.move(cx + dx * (i + 1), cy + Math.sin(i / 4) * 4, { steps: 2 });
    const delta = await page.evaluate(async () => {
      const t0 = performance.now();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      return performance.now() - t0;
    });
    rafSamples.push(delta);
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
  let perfStats = null;
  if (hasPerf) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(32);
      perfStats = await page.evaluate(() => window.__citycutPerf?.readSample?.() ?? null);
      if (perfStats) break;
    }
  }
  const edgeCounts = await page.evaluate(() => {
    let buildingEdges = 0;
    let buildingEdge = 0;
    let selectionDashed = 0;
    const canvas = document.querySelector(".model canvas");
    const scene = canvas && canvas.__r3f?.root?.getState?.()?.scene;
    if (!scene) return { buildingEdges, buildingEdge, selectionDashed };
    scene.traverse((object) => {
      if (object.name === "BuildingEdges") buildingEdges += 1;
      if (object.name === "BuildingEdge") buildingEdge += 1;
      if (object.name === "BuildingSelectionOutline") selectionDashed += 1;
    });
    return { buildingEdges, buildingEdge, selectionDashed };
  });
  const stats = summarizeDeltas(rafSamples);
  return {
    stats,
    perfStats,
    drawCallsPeak: perfStats?.drawCallsPeak ?? null,
    edgeCounts,
  };
}

async function measureTarget(target) {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: CHROME_ARGS,
  });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(180000);
    await openModel(page, target.url);
    const orbit = await mouseOrbitSample(page, 4500);
    const pan = await mouseOrbitSample(page, 3500);
    return {
      id: target.id,
      url: target.url,
      orbit: orbit.stats,
      pan: pan.stats,
      drawCallsPeakOrbit: orbit.drawCallsPeak,
      drawCallsPeakPan: pan.drawCallsPeak,
      edgeCountsOrbit: orbit.edgeCounts,
      edgeCountsPan: pan.edgeCounts,
    };
  } finally {
    await browser.close();
  }
}

async function runAll() {
  let localPreview = null;
  const branchUrl = BRANCH_PREVIEW_URL;
  if (!branchUrl) {
    localPreview = await startLocalPreview();
  }
  const targets = [
    { id: "main", url: MAIN_URL },
    { id: "branch", url: branchUrl ?? localPreview.baseUrl },
  ];
  const results = [];
  try {
    for (const target of targets) {
      results.push(await measureTarget(target));
    }
  } finally {
    localPreview?.proc.kill("SIGTERM");
  }
  console.log(JSON.stringify({ site: SITE, mainUrl: MAIN_URL, results }, null, 2));
}

runAll().catch((error) => {
  console.error(error);
  process.exit(1);
});
