import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  await page.locator("button.create-fab").click({ timeout: 60_000 });
  await page.waitForSelector(".model", { timeout: 360_000 });
  await page.getByRole("tab", { name: /Drawing/i }).click();
  await page.waitForSelector("svg.plan", { timeout: 120_000 });
  await page.getByRole("button", { name: "Uniform", exact: true }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/uniform-drawing-cleeland-roads.png` });
} finally {
  await browser.close();
  dev.kill("SIGTERM");
}
