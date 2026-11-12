import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import net from "node:net";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const QUERY =
  "qa=1&lat=-37.983826&lon=145.21555&label=40+Cleeland+St%2C+Dandenong+VIC+3175&km=1";

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

const port = await findFreePort();
const preview = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: new URL("..", import.meta.url).pathname,
  stdio: "pipe",
});

await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("preview timeout")), 60_000);
  preview.stdout?.on("data", (chunk) => {
    if (String(chunk).includes("Local:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  preview.on("error", reject);
});

const base = `http://127.0.0.1:${port}/citycut/?${QUERY}`;
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(300_000);

try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create model", exact: true }).click({ timeout: 300_000 }).catch(async () => {
    await page.locator("button.create-fab").click({ timeout: 300_000 });
  });
  await page.waitForSelector(".model-chrome", { timeout: 300_000 });
  await page.waitForTimeout(12_000);

  await page.getByRole("tab", { name: "Drawing" }).click();
  await page.waitForTimeout(1500);

  const uniformBtn = page.getByRole("button", { name: "Uniform", exact: true });
  await uniformBtn.click();
  await page.waitForTimeout(2000);

  await page.screenshot({
    path: `${outDir}/uniform-drawing-cleeland-roads.png`,
    fullPage: false,
  });
} finally {
  await browser.close();
  preview.kill("SIGTERM");
}
