import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const PREVIEW =
  "https://citycut-git-cursor-primary-hud-wind-f5db-kchai.vercel.app/?lat=-37.983826&lon=145.21555&label=40+Cleeland+St%2C+Dandenong+VIC+3175&km=1";

function absDiff(bufA, bufB) {
  const a = PNG.sync.read(bufA);
  const b = PNG.sync.read(bufB);
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2;
      const dr = Math.abs(a.data[i] - b.data[i]);
      const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
      const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
      const d = Math.max(dr, dg, db);
      const boost = Math.min(255, d * 12);
      out.data[i] = boost;
      out.data[i + 1] = boost;
      out.data[i + 2] = boost;
      out.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(out);
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
  await page.waitForTimeout(24_000);

  await page.getByRole("button", { name: "Primary", exact: true }).click().catch(() => {});
  await page.waitForTimeout(1200);

  await page.waitForFunction(() => window.__citycutQa?.setCamera, null, { timeout: 180_000 }).catch(() => {});
  await page.evaluate(() => {
    window.__citycutQa?.setCamera?.({
      eye: { x: 520, y: 65, z: 520 },
      target: { x: 0, y: 5, z: 0 },
    });
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outDir}/primary-section-sides-cleeland.png` });

  await page.evaluate(() => {
    window.__citycutQa?.setCamera?.({
      eye: { x: 120, y: 95, z: 180 },
      target: { x: 80, y: 8, z: -40 },
    });
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${outDir}/primary-plinth-crop-cleeland.png` });

  const windBtn = page.getByRole("button", { name: /3D Wind Flow/i });
  if (await windBtn.count()) await windBtn.click();
  await page.waitForTimeout(4000);

  await page.evaluate(() => {
    window.__citycutQa?.setCamera?.({
      eye: { x: -420, y: 120, z: 380 },
      target: { x: 0, y: 4, z: 0 },
    });
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outDir}/wind-overview-live-cleeland.png` });

  await page.evaluate(() => {
    window.__citycutQa?.setCamera?.({
      eye: { x: 55, y: 14, z: 95 },
      target: { x: 10, y: 3, z: 5 },
    });
  });
  await page.waitForTimeout(2500);
  const frameA = await page.screenshot();
  await page.waitForTimeout(1100);
  const frameB = await page.screenshot();
  await page.screenshot({ path: `${outDir}/wind-street-close-live-cleeland.png` });
  writeFileSync(`${outDir}/wind-motion-frame-a-live.png`, frameA);
  writeFileSync(`${outDir}/wind-motion-frame-b-live.png`, frameB);
  writeFileSync(`${outDir}/wind-motion-diff-live.png`, absDiff(frameA, frameB));
} finally {
  await browser.close();
}
