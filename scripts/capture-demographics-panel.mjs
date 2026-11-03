import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { chromium } from "playwright";

const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };
const OUT = "/opt/cursor/artifacts/demographics-panel-cbd-1440x900.png";

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => resolve(typeof addr === "object" && addr ? addr.port : 5188));
    });
    srv.on("error", reject);
  });
}

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const port = await findFreePort();
const baseUrl = `http://127.0.0.1:${port}/citycut/`;
const viteProc = spawn(
  path.join(process.cwd(), "node_modules/.bin/vite"),
  ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: process.cwd(), stdio: "ignore", env: { ...process.env, BROWSER: "none" } },
);

try {
  await waitForServer(baseUrl);
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(`${baseUrl}?lat=-37.8136&lon=144.9633&km=1`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create model" }).click();
  await page.waitForSelector(".model", { timeout: 180_000 });
  await page.getByRole("tab", { name: "Drawing" }).click();
  await page.getByRole("button", { name: "Demographics" }).click();
  await page.waitForSelector(".demo-inspector .demo-headline", { timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.locator(".right-inspector").screenshot({ path: OUT });
  await browser.close();
  console.log(OUT);
} finally {
  viteProc.kill("SIGTERM");
}
