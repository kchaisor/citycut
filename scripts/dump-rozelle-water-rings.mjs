import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

const REPO = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const OUT = path.join(REPO, "src/lib/__fixtures__/rozelle-1km-water-clipped.json");

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

const port = await findFreePort();
const vite = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: REPO,
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 5000));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/citycut/?qa=1&lat=-33.8677&lon=151.1832&km=1`, {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});
await page.click("button.create-fab");
await page.waitForFunction(() => /Ready ·/.test(document.body.innerText), { timeout: 360000 });
const rings = await page.evaluate(() => {
  const model = window.__citycutQaModel;
  if (!model?.getClippedWaterRings) return null;
  return model.getClippedWaterRings();
});
vite.kill();
await browser.close();
if (!rings) {
  console.error("No water rings from qa bridge");
  process.exit(1);
}
fs.writeFileSync(OUT, JSON.stringify({ center: { lat: -33.8677, lon: 151.1832 }, sideM: 1000, rings }, null, 2));
console.log("Wrote", OUT, "groups", rings.length);