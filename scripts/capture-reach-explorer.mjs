import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { chromium } from "playwright";

const CHROME_PATH = "/usr/bin/google-chrome";
const VIEWPORT = { width: 1440, height: 900 };

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => resolve(typeof addr === "object" && addr ? addr.port : 5199));
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

const artifactsDir = fs.existsSync("/opt/cursor/artifacts") ? "/opt/cursor/artifacts" : "/workspace";

const port = await findFreePort();
const baseUrl = `http://127.0.0.1:${port}/citycut/?qa=1`;
const vite = spawn(path.join(process.cwd(), "node_modules/.bin/vite"), ["--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: process.cwd(),
  stdio: "ignore",
  env: { ...process.env, BROWSER: "none" },
});

try {
  await waitForServer(baseUrl);
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("button.create-fab", { timeout: 20000 });
  await page.click("button.create-fab");
  await page.waitForSelector(".model", { timeout: 120000 });
  await page.getByRole("tab", { name: /Drawing/i }).click({ force: true });
  await page.getByRole("button", { name: /Quick Demographics/i }).click({ force: true });
  await page.waitForSelector('[data-reach-map="true"]', { timeout: 30000 });
  await page.waitForFunction(() => Boolean(window.__citycutReachQa), { timeout: 45000 });
  await page.waitForTimeout(1200);
  const out = path.join(artifactsDir, "reach-explorer-flinders-1440x900.png");
  await page.screenshot({ path: out });
  await browser.close();
  console.log(`Saved ${out}`);
} finally {
  vite.kill("SIGTERM");
}
