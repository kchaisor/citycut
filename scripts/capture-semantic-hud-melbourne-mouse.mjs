import { chromium } from "playwright";
import { mkdirSync, renameSync, existsSync, readFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { PNG } from "pngjs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const MELBOURNE_CBD = { lat: -37.8136, lon: 144.9631, km: 1, label: "Melbourne CBD" };

const PREVIEW_BASE =
  process.env.SEMANTIC_HUD_BASE_URL?.replace(/\/$/, "") ??
  "https://citycut-git-feat-distance-aware-hud-kchai.vercel.app";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canvasVariance(pngPath) {
  const buf = readFileSync(pngPath);
  const png = PNG.sync.read(buf);
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const l = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
    sum += l;
    sumSq += l * l;
    n += 1;
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

async function currentMode(page) {
  return page.evaluate(() => {
    const stackMode = document.querySelector(".semantic-hud-stack")?.getAttribute("data-semantic-mode");
    const qaMode = window.__citycutSemanticHud?.mode;
    const chip = document.querySelector(".semantic-hud-mode-chip")?.textContent?.trim();
    return stackMode ?? qaMode ?? chip?.toLowerCase() ?? null;
  });
}

let preview = null;
let baseUrl = `${PREVIEW_BASE}/?qa=1&lat=${MELBOURNE_CBD.lat}&lon=${MELBOURNE_CBD.lon}&km=${MELBOURNE_CBD.km}&label=${encodeURIComponent(MELBOURNE_CBD.label)}`;

if (process.env.SEMANTIC_HUD_LOCAL === "1") {
  preview = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4174"], {
    cwd: "/workspace",
    stdio: "ignore",
  });
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:4174/citycut/");
      if (res.ok) break;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  baseUrl = `http://127.0.0.1:4174/citycut/?qa=1&lat=${MELBOURNE_CBD.lat}&lon=${MELBOURNE_CBD.lon}&km=${MELBOURNE_CBD.km}&label=${encodeURIComponent(MELBOURNE_CBD.label)}`;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: "/tmp/citycut-hud-mel-vid", size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
page.setDefaultTimeout(600_000);

await page.addInitScript(() => {
  try {
    window.localStorage.setItem("citycut.sidebar.collapsed", "1");
  } catch {
    /* ignore */
  }
});

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.waitForSelector("button.create-fab", { timeout: 240_000 });
await page.locator("button.create-fab").click();
await page.waitForSelector(".model canvas", { timeout: 600_000 });
await page.waitForFunction(
  () => document.querySelector(".model")?.dataset.introHold !== "true",
  null,
  { timeout: 600_000 },
);
await page.waitForFunction(
  () => (window.__citycutQaModel?.getSummary?.().triangleCount ?? 0) > 1000,
  null,
  { timeout: 600_000 },
);
await page.getByRole("button", { name: "Summary", exact: true }).click().catch(() => undefined);
await page.waitForFunction(
  () =>
    Boolean(document.querySelector(".semantic-hud-stack")) ||
    typeof window.__citycutSemanticHud?.mode === "string",
  null,
  { timeout: 180_000 },
);
await sleep(2500);

const viewport = page.locator(".model .scene-viewport");

async function dragOrbit(dx, dy, steps = 14) {
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Missing viewport box");
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.52;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "left" });
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps, { steps: 1 });
    await sleep(45);
  }
  await page.mouse.up({ button: "left" });
  await sleep(900);
}

async function wheelZoom(deltaY, times = 8) {
  const box = await viewport.boundingBox();
  if (!box) throw new Error("Missing viewport box");
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.52;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < times; i++) {
    await page.mouse.wheel(0, deltaY);
    await sleep(130);
  }
  await sleep(900);
}

async function waitHudMode(mode, timeoutMs = 180_000) {
  await page.waitForFunction(
    (m) => {
      const stackMode = document.querySelector(".semantic-hud-stack")?.getAttribute("data-semantic-mode");
      const qaMode = window.__citycutSemanticHud?.mode;
      const chip = document.querySelector(".semantic-hud-mode-chip")?.textContent?.trim()?.toLowerCase();
      const chipMode =
        chip === "site" ? "overview" : chip === "building" ? "building" : chip === "street" ? "walk" : null;
      if (m === "overview") {
        const visiblePane = document.querySelector(".semantic-hud-stack .semantic-hud-pane.is-visible");
        const modeAttr = visiblePane?.closest(".semantic-hud-stack")?.getAttribute("data-semantic-mode");
        if (modeAttr === "overview" || stackMode === "overview" || qaMode === "overview" || chipMode === "overview") {
          return true;
        }
      }
      return stackMode === m || qaMode === m || chipMode === m;
    },
    mode,
    { timeout: timeoutMs },
  );
  await sleep(500);
}

async function assertCanvasRendered(tag) {
  const path = `${outDir}/.probe-${tag}.png`;
  await viewport.screenshot({ path });
  const variance = canvasVariance(path);
  if (variance < 120) {
    throw new Error(`Viewport looks empty for ${tag} (variance=${variance.toFixed(1)})`);
  }
  return variance;
}

async function shotMode(tag, mode, assertInspector) {
  if (mode === "overview") {
    await page.waitForSelector(".semantic-hud-stack", { timeout: 180_000 });
    await sleep(600);
  } else {
    await waitHudMode(mode);
  }
  await assertInspector();
  await assertCanvasRendered(tag);
  await page.screenshot({ path: `${outDir}/semantic-hud-melbourne-${tag}-1440x900.png`, fullPage: false });
}

async function tryReachMode(mode, attempt) {
  if (mode === "building") {
    const zoomBursts = attempt === 1 ? 18 : 22;
    await wheelZoom(-220, zoomBursts);
    await dragOrbit(32, -24);
    await wheelZoom(-200, zoomBursts - 2);
    await dragOrbit(-18, -14);
    await wheelZoom(-180, zoomBursts - 4);
    if (attempt > 1) {
      await dragOrbit(40, -8);
      await wheelZoom(-160, 12);
    }
  } else if (mode === "walk") {
    await wheelZoom(160, 10);
    await dragOrbit(attempt === 1 ? 95 : -110, 8);
    await wheelZoom(-260, 22);
    await dragOrbit(-12, 72);
    await wheelZoom(-240, 20);
    await dragOrbit(18, 68);
    await wheelZoom(-220, 18);
    await dragOrbit(-8, 62);
    if (attempt > 1) {
      await dragOrbit(120, 10);
      await wheelZoom(-200, 16);
      await dragOrbit(6, 78);
      await wheelZoom(-180, 14);
    }
  } else {
    await wheelZoom(260, 14);
    await dragOrbit(-36, 16);
    await wheelZoom(220, 12);
  }
  await sleep(800);
  return currentMode(page);
}

const results = { overview: false, building: false, walk: false, attempts: [] };

try {
  await shotMode("overview", "overview", async () => {
    const text = await page.locator('.right-inspector [aria-label="In this model"]').innerText();
    if (!/Bldgs/i.test(text)) throw new Error("Overview inspector missing Bldgs KPI");
  });
  results.overview = true;

  for (let attempt = 1; attempt <= 2 && !results.building; attempt++) {
    const mode = await tryReachMode("building", attempt);
    results.attempts.push({ target: "building", attempt, mode });
    try {
      await waitHudMode("building", 45_000);
      results.building = true;
    } catch {
      /* retry */
    }
  }
  if (!results.building) throw new Error("Could not reach building mode with mouse only (2 attempts)");
  await shotMode("building", "building", async () => {
    const section = page.locator(".semantic-hud-building");
    await section.waitFor({ state: "visible", timeout: 30_000 });
    const text = await section.innerText();
    if (!/Height/i.test(text) || !/GFA/i.test(text)) {
      throw new Error(`Building inspector incomplete: ${text.slice(0, 120)}`);
    }
  });

  for (let attempt = 1; attempt <= 2 && !results.walk; attempt++) {
    const mode = await tryReachMode("walk", attempt);
    results.attempts.push({ target: "walk", attempt, mode });
    try {
      await waitHudMode("walk", 45_000);
      results.walk = true;
    } catch {
      /* retry */
    }
  }
  if (!results.walk) throw new Error("Could not reach street/walk mode with mouse only (2 attempts)");
  await shotMode("walk", "walk", async () => {
    const section = page.locator(".semantic-hud-walk");
    await section.waitFor({ state: "visible", timeout: 30_000 });
    const text = await section.innerText();
    if (!/Street/i.test(text) || !/Width/i.test(text)) {
      throw new Error(`Walk inspector incomplete: ${text.slice(0, 120)}`);
    }
    if (!/Left bldg/i.test(text) || !/Right bldg/i.test(text)) {
      throw new Error("Walk inspector missing lateral building heights");
    }
  });
} catch (err) {
  results.error = String(err?.message ?? err);
}

const videoPath = await page.video()?.path();
await context.close();
await browser.close();
if (preview) preview.kill("SIGTERM");

const mp4Out = `${outDir}/semantic-hud-melbourne-mouse.mp4`;
if (videoPath && existsSync(videoPath)) {
  execFileSync(
    "ffmpeg",
    ["-y", "-i", videoPath, "-t", "12", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", mp4Out],
    { stdio: "pipe" },
  );
}

console.log(JSON.stringify({ outDir, mp4Out, baseUrl, results, ok: !results.error }, null, 2));
if (results.error) process.exit(1);
