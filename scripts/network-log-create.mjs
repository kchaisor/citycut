import { chromium } from "playwright";
import fs from "node:fs";

const logPath = "/opt/cursor/artifacts/create-network-log.json";
const url = "http://127.0.0.1:5173/citycut/?lat=-37.8136&lon=144.9631&km=1";
const requests = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("request", (req) => {
  requests.push({ method: req.method(), url: req.url() });
});
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Layers", exact: true }).click();
for (const [label, on] of [
  ["Buildings", true],
  ["Roads and rail", true],
  ["Water and green", true],
  ["Trees", true],
  ["Terrain", true],
  ["Contours", true],
]) {
  const row = page.locator(".layers li").filter({ hasText: label });
  const toggle = row.locator("button.toggle");
  const pressed = await toggle.getAttribute("aria-pressed");
  if ((pressed === "true") !== on) await toggle.click();
}
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 180_000 });
await browser.close();

const overpassHits = requests.filter((r) => /overpass/i.test(r.url));
const report = {
  requestCount: requests.length,
  overpassRequestCount: overpassHits.length,
  overpassUrls: overpassHits.map((r) => r.url),
  sampleHosts: [...new Set(requests.map((r) => new URL(r.url).host))].slice(0, 20),
};
fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
fs.writeFileSync(logPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
