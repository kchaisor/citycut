import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const PREVIEW =
  "https://citycut-git-cursor-primary-hud-wind-f5db-kchai.vercel.app/?lat=-37.983826&lon=145.21555&label=40+Cleeland+St%2C+Dandenong+VIC+3175&km=1";

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function absDiff(bufA, bufB) {
  const a = PNG.sync.read(bufA);
  const b = PNG.sync.read(bufB);
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const out = new PNG({ width: w, height: h });
  let changed = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (w * y + x) << 2;
      const dr = Math.abs(a.data[i] - b.data[i]);
      const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
      const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
      const d = Math.max(dr, dg, db);
      const boost = Math.min(255, d * 14);
      if (d > 8) changed += 1;
      out.data[i] = boost;
      out.data[i + 1] = boost;
      out.data[i + 2] = boost;
      out.data[i + 3] = 255;
    }
  }
  return { png: PNG.sync.write(out), changed, total: w * h };
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

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});

const manifests = [];

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(420_000);
  await page.goto(PREVIEW, { waitUntil: "domcontentloaded" });
  await page.locator("button.create-fab").click({ timeout: 120_000 });
  await page.waitForSelector(".model", { timeout: 420_000 });
  await waitSettled(page, 26_000);

  await dragOrbit(page, 720, 650, 720, 250);
  await dragOrbit(page, 900, 450, 300, 450);
  await dragOrbit(page, 300, 450, 300, 650);

  const frontal = await page.screenshot({ path: `${outDir}/proof-plinth-frontal-live.png` });
  manifests.push(["proof-plinth-frontal-live.png", sha(frontal)]);

  await dragOrbit(page, 620, 480, 540, 430);
  const corner = await page.screenshot({ path: `${outDir}/proof-plinth-corner-live.png` });
  manifests.push(["proof-plinth-corner-live.png", sha(corner)]);

  const windBtn = page.getByRole("button", { name: /3D Wind Flow/i });
  if (await windBtn.count()) await windBtn.click();
  await waitSettled(page, 4500);

  await dragOrbit(page, 480, 400, 380, 360);
  const windOverview = await page.screenshot({ path: `${outDir}/proof-wind-overview-live.png` });
  manifests.push(["proof-wind-overview-live.png", sha(windOverview)]);

  await dragOrbit(page, 380, 360, 540, 460);
  const windStreet = await page.screenshot({ path: `${outDir}/proof-wind-street-live.png` });
  manifests.push(["proof-wind-street-live.png", sha(windStreet)]);

  await waitSettled(page, 1500);
  const frameA = await page.screenshot();
  await waitSettled(page, 1100);
  const frameB = await page.screenshot();
  writeFileSync(`${outDir}/proof-wind-motion-a-live.png`, frameA);
  writeFileSync(`${outDir}/proof-wind-motion-b-live.png`, frameB);
  const diff = absDiff(frameA, frameB);
  writeFileSync(`${outDir}/proof-wind-motion-diff-live.png`, diff.png);
  manifests.push(["proof-wind-motion-a-live.png", sha(frameA)]);
  manifests.push(["proof-wind-motion-b-live.png", sha(frameB)]);
  manifests.push(["proof-wind-motion-diff-live.png", sha(diff.png), `${((diff.changed / diff.total) * 100).toFixed(2)}% pixels`]);

  const unique = new Set(manifests.map((m) => m[1]));
  if (unique.size < manifests.length - 1) {
    throw new Error(`duplicate screenshot hashes: ${JSON.stringify(manifests)}`);
  }
  writeFileSync(`${outDir}/proof-capture-manifest.json`, JSON.stringify(manifests, null, 2));
} finally {
  await browser.close();
}
