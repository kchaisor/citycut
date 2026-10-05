import { chromium } from "playwright";
import fs from "node:fs";

const outBefore = "/opt/cursor/artifacts/cap-before.png";
const outAfter = "/opt/cursor/artifacts/cap-after.png";
fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });

const base =
  "http://127.0.0.1:5173/citycut-export/?lat=-37.8030&lon=145.1060&km=1&view=iso-se";

async function capture(url, out) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(180_000);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  async function setLayer(name, on) {
    const row = page.locator(".layers li").filter({ hasText: name });
    const toggle = row.locator("button.toggle");
    const pressed = await toggle.getAttribute("aria-pressed");
    if ((pressed === "true") !== on) await toggle.click();
  }
  await setLayer("Trees", false);
  await setLayer("Buildings", true);
  await setLayer("Terrain", false);
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 180_000 });
  const buildingsRail = page.getByRole("button", { name: "Buildings", exact: true });
  if ((await buildingsRail.getAttribute("aria-expanded")) === "true") {
    await buildingsRail.click();
  }
  await page.locator(".viewport canvas").waitFor({ state: "visible" });
  await page.waitForTimeout(5000);
  await page.locator(".viewport canvas").screenshot({ path: out });
  await browser.close();
}

await capture(base, outBefore);
await capture(`${base}&heightCap=non_osm_height`, outAfter);
console.log(JSON.stringify({ outBefore, outAfter }));
