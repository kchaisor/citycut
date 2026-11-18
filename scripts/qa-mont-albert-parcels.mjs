import { spawn } from "node:child_process";
import net from "node:net";
import { chromium } from "playwright";

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 5188;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

const port = await freePort();
const vite = spawn(`${process.cwd()}/node_modules/.bin/vite`, ["--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 4000));

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  window.__citycutVerifyHarness = true;
  window.__citycutMinSilentLoadMs = 500;
});
await page.goto(`http://127.0.0.1:${port}/citycut/`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("button.create-fab", { timeout: 20000 });

await page.getByRole("button", { name: "Mont Albert North" }).click();
await page.waitForTimeout(400);
await page.click("button.create-fab");
await page.waitForFunction(() => document.querySelector(".model canvas"), null, { timeout: 180000 });
await page.waitForFunction(
  () => Number(document.querySelector(".model canvas")?.dataset.introProgressPct ?? 0) >= 100,
  null,
  { timeout: 180000 },
);
await page.evaluate(() => {
  window.__citycutIntroPaused = true;
});
await page.waitForTimeout(800);
await page.waitForFunction(() => window.__citycutQaMassing?.enableTool != null, null, { timeout: 60000 });
await page.click('button[aria-label="Massing tool"]');
await page.waitForTimeout(1200);
await page
  .waitForFunction(() => window.__citycutQaParcels?.status === "ready" || window.__citycutQaParcels?.status === "error", null, {
    timeout: 120000,
  })
  .catch(() => {});
const qa = await page.evaluate(() => ({
  parcels: window.__citycutQaParcels ?? null,
}));
console.log(JSON.stringify(qa, null, 2));
await page.screenshot({ path: "/opt/cursor/artifacts/qa-mont-albert-parcels-debug.png", fullPage: true });
await browser.close();
vite.kill();
process.exit(qa.parcels?.count > 0 ? 0 : 1);
