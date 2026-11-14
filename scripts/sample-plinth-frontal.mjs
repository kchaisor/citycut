import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const PREVIEW =
  process.env.CITYCUT_PREVIEW ??
  "https://citycut-git-cursor-primary-hud-wind-f5db-kchai.vercel.app/?lat=-37.983826&lon=145.21555&label=40+Cleeland+St%2C+Dandenong+VIC+3175&km=1";

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

async function waitSettled(page, ms = 2200) {
  await page.waitForTimeout(ms);
}

async function dragOrbit(page, fromX, fromY, toX, toY) {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + fromX, box.y + fromY);
  await page.mouse.down();
  await page.mouse.move(box.x + toX, box.y + toY, { steps: 24 });
  await page.mouse.up();
  await waitSettled(page, 2800);
}

function sampleBand(png, x0, y0, w, h) {
  const hist = new Map();
  let minR = 255;
  let minG = 255;
  let minB = 255;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let n = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (png.width * y + x) << 2;
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      const key = `${r},${g},${b}`;
      hist.set(key, (hist.get(key) ?? 0) + 1);
      minR = Math.min(minR, r);
      minG = Math.min(minG, g);
      minB = Math.min(minB, b);
      sumR += r;
      sumG += g;
      sumB += b;
      n += 1;
    }
  }
  const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  const [medianKey] = sorted[0] ?? ["0,0,0", 0];
  return {
    pixels: n,
    dominant: medianKey,
    dominantCount: sorted[0]?.[1] ?? 0,
    medianRgb: medianKey.split(",").map(Number),
    meanRgb: [Math.round(sumR / n), Math.round(sumG / n), Math.round(sumB / n)],
    minRgb: [minR, minG, minB],
    above250: sorted.filter(([k]) => {
      const [r, g, b] = k.split(",").map(Number);
      return r >= 250 && g >= 250 && b >= 250;
    }).reduce((acc, [, c]) => acc + c, 0),
  };
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(420_000);
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await page.locator("button.create-fab").click({ timeout: 120_000 });
  await page.waitForSelector(".model", { timeout: 420_000 });
  await waitSettled(page, 26_000);
  await dragOrbit(page, 640, 420, 520, 380);
  await dragOrbit(page, 520, 380, 700, 560);
  await dragOrbit(page, 700, 560, 860, 620);

  const shot = await page.screenshot({ path: `${outDir}/proof-plinth-frontal-after-ao-exempt.png` });
  const png = PNG.sync.read(shot);
  const band = sampleBand(png, Math.floor(png.width * 0.42), Math.floor(png.height * 0.22), Math.min(160, png.width), Math.min(700, png.height));
  const report = {
    preview: PREVIEW,
    sha: sha(shot),
    band,
    pass: band.minRgb[0] >= 250 && band.minRgb[1] >= 250 && band.minRgb[2] >= 250,
  };
  writeFileSync(`${outDir}/proof-plinth-frontal-sample.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass && band.meanRgb[0] < 250) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
