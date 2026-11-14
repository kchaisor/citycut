import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn, execFileSync } from "node:child_process";

const REPO = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const ART = process.env.CURSOR_ARTIFACTS || "/opt/cursor/artifacts";
const planShot = path.join(ART, "rozelle-1km-3d-plan-winding-fix.png");
const perspectiveShot = path.join(ART, "rozelle-1km-3d-perspective-winding-fix.png");

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

fs.mkdirSync(ART, { recursive: true });
const port = await findFreePort();
const vite = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: REPO,
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 4000));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`http://127.0.0.1:${port}/citycut/?qa=1&lat=-33.8677&lon=151.1832&km=1`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.click("button.create-fab");
await page.waitForFunction(
  () => {
    const canvas = document.querySelector(".scene-viewport canvas");
    const spanX = Number(canvas?.dataset.citycutGroundSpanX ?? 0);
    return /Ready ·/.test(document.body.innerText) && spanX > 100;
  },
  { timeout: 360000 },
);
await page.waitForTimeout(1200);
await page.screenshot({
  path: perspectiveShot,
  clip: { x: 0, y: 0, width: 1440, height: 900 },
});
const planBtn = page.locator(".model .proj-group button", { hasText: "Plan" }).first();
if ((await planBtn.count()) > 0) await planBtn.click({ timeout: 30000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: planShot, clip: { x: 0, y: 0, width: 1440, height: 900 } });
vite.kill();
await browser.close();
const audit = JSON.parse(execFileSync("node", [path.join(REPO, "scripts/audit-rozelle-plan-png.mjs"), planShot], { encoding: "utf8" }));
console.log(JSON.stringify({ audit, planShot, perspectiveShot }, null, 2));