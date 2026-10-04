import { chromium } from "playwright";
import fs from "node:fs";

const [out, lat, lon, km, label] = process.argv.slice(2);
if (!out || lat == null || lon == null || !km) {
  throw new Error("usage: capture-full-3d.mjs <out.png> <lat> <lon> <km>");
}

fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
const url = `http://127.0.0.1:5173/citycut-export/?lat=${lat}&lon=${lon}&km=${km}`;
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
for (const [name, on] of [
  ["Buildings", true],
  ["Roads and rail", true],
  ["Water and green", true],
  ["Trees", true],
  ["Terrain", false],
  ["Contours", false],
]) {
  await setLayer(name, on);
}
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 180_000 });
await page.getByRole("button", { name: "Buildings", exact: true }).click();
await page.locator(".viewport canvas").waitFor({ state: "visible" });
await page.waitForTimeout(6000);
await page.screenshot({ path: out, fullPage: false });
const count = await page.locator(".stats dd").first().textContent();
await browser.close();
console.log(JSON.stringify({ out, label: label ?? "", lat, lon, km, buildings: count?.trim() }));
