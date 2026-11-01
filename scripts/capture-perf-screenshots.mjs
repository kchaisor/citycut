import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { chromium } from "playwright";

const SITES = [
  { id: "melbourne-cbd", lat: -37.8136, lon: 144.9631, km: 0.5 },
  { id: "dandenong", lat: -37.98382, lon: 145.21555, km: 1.15 },
];

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => resolve(typeof addr === "object" && addr ? addr.port : 4173));
    });
    srv.on("error", reject);
  });
}

async function waitForServer(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function capture(baseUrl, prefix, outDir) {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    window.__citycutMinSilentLoadMs = 0;
  });
  for (const site of SITES) {
    await page.goto(`${baseUrl}?qa=1&view=persp&lat=${site.lat}&lon=${site.lon}&km=${site.km}`, {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
    await page.locator("button.create-fab").click();
    await page.waitForSelector(".model canvas", { timeout: 600000 });
    await page.waitForTimeout(12000);
    const out = path.join(outDir, `${prefix}-${site.id}-perspective.png`);
    await page.screenshot({ path: out });
    console.log("wrote", out);
  }
  await browser.close();
}

const [cwd, prefix, outDir] = process.argv.slice(2);
if (!cwd || !prefix || !outDir) throw new Error("usage: capture-perf-screenshots.mjs <build-cwd> <prefix> <outDir>");
fs.mkdirSync(outDir, { recursive: true });
const port = await findFreePort();
const proc = spawn(path.join(cwd, "node_modules/.bin/vite"), ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd,
  stdio: "ignore",
});
const baseUrl = `http://127.0.0.1:${port}/citycut/`;
await waitForServer(baseUrl);
try {
  await capture(baseUrl, prefix, outDir);
} finally {
  proc.kill("SIGTERM");
}
