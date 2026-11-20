import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const DANDENONG =
  "http://127.0.0.1:4173/citycut/?qa=1&lat=-37.983826&lon=145.21555&label=40+Cleeland+St%2C+Dandenong+VIC+3175&km=1";

function isBlue(r, g, b, a) {
  if (a < 40) return false;
  return b > 140 && b > r + 35 && b > g + 20;
}

function isGround(r, g, b, a) {
  if (a < 40) return false;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum < 0.08 || lum > 0.92) return false;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread > 55) return false;
  return lum >= 0.22 && lum <= 0.78;
}

function measureGroundBalance(buf, viewW, scale) {
  const img = PNG.sync.read(buf);
  const y0 = Math.round(70 * scale);
  const y1 = Math.round(800 * scale);
  const midX = Math.round((viewW * scale) / 2);
  let wBlue = 0;
  let wGround = 0;
  let eBlue = 0;
  let eGround = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (img.width * y + x) << 2;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      const a = img.data[i + 3];
      const west = x < midX;
      const blue = isBlue(r, g, b, a);
      const ground = isGround(r, g, b, a);
      if (west) {
        if (blue) wBlue++;
        if (ground) wGround++;
      } else {
        if (blue) eBlue++;
        if (ground) eGround++;
      }
    }
  }
  const westDensity = wGround > 0 ? wBlue / wGround : 0;
  const eastDensity = eGround > 0 ? eBlue / eGround : 0;
  const ratio = eastDensity > 0 ? westDensity / eastDensity : 0;
  return { westDensity, eastDensity, ratio, wBlue, eBlue, wGround, eGround };
}

async function waitSettled(page, ms = 2400) {
  await page.waitForTimeout(ms);
}

async function wheelZoomIn(page, steps, cx = 720, cy = 450) {
  await page.waitForSelector("canvas", { timeout: 420_000 });
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox({ timeout: 60_000 });
  if (!box) throw new Error("viewport canvas missing");
  const x = box.x + (cx / 1440) * box.width;
  const y = box.y + (cy / 900) * box.height;
  await page.mouse.move(x, y);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, -160);
    await page.waitForTimeout(220);
  }
  await waitSettled(page, 3200);
}

async function dragOrbit(page, fromX, fromY, toX, toY) {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + fromX, box.y + fromY);
  await page.mouse.down();
  await page.mouse.move(box.x + toX, box.y + toY, { steps: 28 });
  await page.mouse.up();
  await waitSettled(page, 3000);
}

const preview = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4173"], {
  cwd: "/agent/repos/citycut",
  stdio: "ignore",
});

await new Promise((resolve) => setTimeout(resolve, 2500));

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});

try {
  const page1440 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page1440.setDefaultTimeout(420_000);
  await page1440.goto(DANDENONG, { waitUntil: "domcontentloaded" });
  await page1440.locator("button.create-fab").click({ timeout: 120_000 });
  await page1440.waitForSelector(".model", { timeout: 420_000 });
  await page1440.waitForSelector("canvas", { timeout: 420_000 });
  await waitSettled(page1440, 24_000);

  const windBtn = page1440.getByRole("button", { name: /3D Wind Flow/i });
  if (await windBtn.count()) await windBtn.click();
  await waitSettled(page1440, 6000);

  await wheelZoomIn(page1440, 6);
  await dragOrbit(page1440, 720, 520, 720, 380);
  await dragOrbit(page1440, 880, 460, 420, 460);

  const frame0 = await page1440.screenshot({ path: `${outDir}/ground-wind-dandenong-t0.png` });
  await waitSettled(page1440, 700);
  const frame1 = await page1440.screenshot({ path: `${outDir}/ground-wind-dandenong-t1.png` });
  await waitSettled(page1440, 700);
  const frame2 = await page1440.screenshot({ path: `${outDir}/ground-wind-dandenong-t2.png` });

  await dragOrbit(page1440, 520, 620, 980, 320);
  await page1440.screenshot({ path: `${outDir}/ground-wind-se-park-crop.png`, clip: { x: 720, y: 280, width: 520, height: 420 } });

  await dragOrbit(page1440, 400, 400, 620, 430);
  await page1440.screenshot({ path: `${outDir}/ground-wind-w-intersection-crop.png`, clip: { x: 80, y: 200, width: 620, height: 520 } });

  const balance = measureGroundBalance(frame2, 1440, 2);
  writeFileSync(
    `${outDir}/ground-wind-ground-balance.json`,
    JSON.stringify({ viewport: "1440x900@2x", yBand: [70, 800], ...balance }, null, 2),
  );

  const page1280 = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await page1280.goto(DANDENONG, { waitUntil: "domcontentloaded" });
  await page1280.locator("button.create-fab").click({ timeout: 120_000 });
  await page1280.waitForSelector(".model", { timeout: 420_000 });
  await waitSettled(page1280, 22_000);
  if (await page1280.getByRole("button", { name: /3D Wind Flow/i }).count()) {
    await page1280.getByRole("button", { name: /3D Wind Flow/i }).click();
  }
  await waitSettled(page1280, 5500);
  await wheelZoomIn(page1280, 6, 640, 400);
  await page1280.screenshot({ path: `${outDir}/ground-wind-dandenong-1280x800.png` });
} finally {
  await browser.close();
  preview.kill("SIGTERM");
}

console.log(JSON.stringify({ artifactsDir: outDir, balancePath: `${outDir}/ground-wind-ground-balance.json` }));
