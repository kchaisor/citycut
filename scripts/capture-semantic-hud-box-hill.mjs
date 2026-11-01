import { chromium } from "playwright";
import { mkdirSync, renameSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const BOX_HILL = { lat: -37.8176, lon: 145.1234, km: 0.4, label: "Box Hill VIC" };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  recordVideo: { dir: outDir, size: { width: 1440, height: 900 } },
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
await page.waitForFunction(() => typeof window.__citycutQa?.setCamera === "function", null, { timeout: 120_000 });
await sleep(2000);

async function setCamera(eye, target) {
  await page.evaluate(
    ({ eye, target }) => {
      window.__citycutQa?.setCamera({ eye, target });
    },
    { eye, target },
  );
  await sleep(900);
}

async function dragOrbit(dx, dy, steps = 10) {
  const box = await page.locator(".model .scene-viewport").boundingBox();
  if (!box) return;
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.52;
  await page.mouse.move(cx, cy);
  await page.mouse.down({ button: "left" });
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps, { steps: 1 });
    await sleep(35);
  }
  await page.mouse.up({ button: "left" });
  await sleep(700);
}

async function wheelZoom(deltaY, times = 6) {
  const box = await page.locator(".model .scene-viewport").boundingBox();
  if (!box) return;
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.52;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < times; i++) {
    await page.mouse.wheel(0, deltaY);
    await sleep(100);
  }
  await sleep(700);
}

await setCamera({ x: 280, y: 260, z: 280 }, { x: 0, y: 8, z: 0 });
await page.screenshot({ path: `${outDir}/semantic-hud-overview-1440x900.png`, fullPage: false });

await setCamera({ x: 42, y: 36, z: 58 }, { x: 0, y: 12, z: 0 });
await wheelZoom(-120, 8);
await dragOrbit(30, -18);
await page.screenshot({ path: `${outDir}/semantic-hud-building-1440x900.png`, fullPage: false });

await setCamera({ x: 18, y: 5.5, z: 22 }, { x: 30, y: 4, z: 40 });
await dragOrbit(10, 80);
await page.screenshot({ path: `${outDir}/semantic-hud-walk-1440x900.png`, fullPage: false });

await setCamera({ x: 280, y: 260, z: 280 }, { x: 0, y: 8, z: 0 });
await sleep(400);
await wheelZoom(-160, 10);
await dragOrbit(90, -30);
await setCamera({ x: 40, y: 34, z: 55 }, { x: 0, y: 10, z: 0 });
await sleep(800);
await setCamera({ x: 16, y: 5.2, z: 20 }, { x: 28, y: 4, z: 38 });
await sleep(1200);

const lastMode = await page.evaluate(
  () => document.querySelector(".scene-canvas")?.dataset.semanticHudMode ?? null,
);
const videoPath = await page.video()?.path();
await context.close();
await browser.close();
preview.kill("SIGTERM");

const mp4Out = `${outDir}/semantic-hud-box-hill-zoom.mp4`;
if (videoPath && existsSync(videoPath)) {
  renameSync(videoPath, mp4Out);
}

console.log(JSON.stringify({ outDir, mp4Out, lastMode }, null, 2));
