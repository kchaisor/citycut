import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const QUERY =
  "qa=1&lat=-37.983826&lon=145.21555&label=40+Cleeland+St%2C+Dandenong+VIC+3175&km=1";

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => resolve(typeof addr === "object" && addr ? addr.port : 5173));
    });
    srv.on("error", reject);
  });
}

function waitForServer(url, timeoutMs = 45_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolve();
      } catch {
      }
      if (Date.now() - start > timeoutMs) return reject(new Error(`server timeout ${url}`));
      setTimeout(tick, 400);
    };
    tick();
  });
}

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
      out.data[i] = d;
      out.data[i + 1] = d;
      out.data[i + 2] = d;
      out.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(out);
}

const port = await findFreePort();
const baseUrl = `http://127.0.0.1:${port}/citycut/?${QUERY}`;
const dev = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  stdio: "pipe",
  env: { ...process.env, BROWSER: "none" },
});

await waitForServer(baseUrl);

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(360_000);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model", { timeout: 360_000 });
  await page.waitForTimeout(18_000);

  await page.getByRole("button", { name: "Primary", exact: true }).click().catch(() => {});
  await page.waitForTimeout(1500);

  await page.screenshot({ path: `${outDir}/primary-cleeland-roads-plinth.png` });

  const windBtn = page.getByRole("button", { name: /3D Wind Flow/i });
  if (await windBtn.count()) await windBtn.click();
  await page.waitForTimeout(2500);

  await page.screenshot({ path: `${outDir}/wind-overview-cleeland.png` });

  await page.waitForFunction(() => window.__citycutQa?.setCamera, null, { timeout: 120_000 });
  await page.evaluate(() => {
    window.__citycutQa?.setCamera({
      eye: { x: 120, y: 12, z: 80 },
      target: { x: 0, y: 2, z: 0 },
    });
  });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${outDir}/wind-ground-close-cleeland.png` });

  const frameA = await page.screenshot();
  await page.waitForTimeout(1100);
  const frameB = await page.screenshot();
  writeFileSync(`${outDir}/wind-motion-frame-a.png`, frameA);
  writeFileSync(`${outDir}/wind-motion-frame-b.png`, frameB);
  writeFileSync(`${outDir}/wind-motion-diff.png`, absDiff(frameA, frameB));
} finally {
  await browser.close();
  dev.kill("SIGTERM");
}
