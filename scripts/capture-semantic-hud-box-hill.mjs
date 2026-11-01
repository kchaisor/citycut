import { chromium } from "playwright";
import { mkdirSync, renameSync, existsSync, readFileSync } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { PNG } from "pngjs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const BOX_HILL = { lat: -37.8176, lon: 145.1234, km: 0.4, label: "Box Hill VIC" };

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

const preview = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4174"], {
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

const baseUrl = `http://127.0.0.1:4174/citycut/?qa=1&lat=${BOX_HILL.lat}&lon=${BOX_HILL.lon}&km=${BOX_HILL.km}&label=${encodeURIComponent(BOX_HILL.label)}`;

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: "/tmp/citycut-hud-vid", size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
page.setDefaultTimeout(600_000);

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.waitForSelector("button.create-fab", { timeout: 120_000 });
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
await page.waitForFunction(() => typeof window.__citycutQa?.setCamera === "function", null, { timeout: 120_000 });
await page.getByRole("button", { name: "Summary", exact: true }).click().catch(() => undefined);
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

async function waitHudMode(mode, timeoutMs = 90_000) {
  await page.waitForFunction(
    (m) => document.querySelector(".semantic-hud-stack")?.getAttribute("data-semantic-mode") === m,
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
  await waitHudMode(mode);
  await assertInspector();
  const variance = await assertCanvasRendered(tag);
  await page.screenshot({ path: `${outDir}/semantic-hud-${tag}-1440x900.png`, fullPage: false });
  return variance;
}

await page.evaluate(() => window.__citycutQaModel?.frameSemanticOverview?.());
await dragOrbit(-20, -10);
await sleep(800);
await shotMode("overview", "overview", async () => {
  const text = await page.locator(".right-inspector .kpi-grid").innerText();
  if (!/Bldgs/i.test(text)) throw new Error("Overview inspector missing Bldgs KPI");
});

await page.evaluate(() => window.__citycutQaModel?.frameSemanticBuildingClose?.());
await wheelZoom(-140, 10);
await dragOrbit(35, -22);
await sleep(800);
await shotMode("building", "building", async () => {
  const section = page.locator(".semantic-hud-building");
  await section.waitFor({ state: "visible", timeout: 30_000 });
  const text = await section.innerText();
  if (!/Height/i.test(text) || !/GFA/i.test(text)) {
    throw new Error(`Building inspector incomplete: ${text.slice(0, 120)}`);
  }
});

await page.evaluate(() => window.__citycutQaModel?.clearHeightSelection?.());
await page.evaluate(() => window.__citycutQaModel?.frameSemanticOverview?.());
await sleep(600);
await page.evaluate(() => window.__citycutQaModel?.frameSemanticWalk?.());
await sleep(1500);
await shotMode("walk", "walk", async () => {
  const section = page.locator(".semantic-hud-walk");
  await section.waitFor({ state: "visible", timeout: 30_000 });
  const text = await section.innerText();
  if (!/Street/i.test(text) || !/Width/i.test(text)) {
    throw new Error(`Walk inspector incomplete: ${text.slice(0, 120)}`);
  }
  if (/GFA/i.test(text)) throw new Error("Walk shot still showing building KPIs");
});

await page.evaluate(() => window.__citycutQaModel?.frameSemanticOverview?.());
await sleep(600);
await wheelZoom(-100, 6);
await page.evaluate(() => window.__citycutQaModel?.frameSemanticBuildingClose?.());
await wheelZoom(-120, 8);
await page.evaluate(() => window.__citycutQaModel?.frameSemanticWalk?.());
await dragOrbit(6, 70);
await sleep(1500);

const videoPath = await page.video()?.path();
await context.close();
await browser.close();
preview.kill("SIGTERM");

const mp4Out = `${outDir}/semantic-hud-box-hill-10s.mp4`;
if (videoPath && existsSync(videoPath)) {
  execFileSync(
    "ffmpeg",
    ["-y", "-i", videoPath, "-t", "10", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", mp4Out],
    { stdio: "pipe" },
  );
}

console.log(JSON.stringify({ outDir, mp4Out, ok: true }, null, 2));
