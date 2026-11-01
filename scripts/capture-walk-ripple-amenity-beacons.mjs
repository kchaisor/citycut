import { chromium } from "playwright";
import { mkdirSync, renameSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const ADDRESS = "1022 Whitehorse Road, Box Hill VIC 3128";
const KM = 0.4;
const SHOT = `${outDir}/walk-ripple-amenity-beacons-box-hill-1440x900.png`;
const CLIP = `${outDir}/walk-ripple-amenity-beacons-box-hill-10s.mp4`;

const boxHillQuery =
  "qa=1&buildings=uniform&lat=-37.8192&lon=145.1233&km=0.4&label=Box%20Hill%20VIC";
const baseUrl =
  process.env.CITYCUT_PREVIEW_URL ?? `http://127.0.0.1:5173/citycut/?${boxHillQuery}`;

async function setLayer(page, label, on) {
  const chip = page.getByRole("button", { name: label, exact: true });
  const pressed = await chip.getAttribute("aria-pressed");
  if ((pressed === "true") !== on) await chip.click();
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: outDir, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
page.setDefaultTimeout(240_000);

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
await page.waitForSelector("button.create-fab", { timeout: 60_000 });
for (const [label, on] of [
  ["Buildings", true],
  ["Roads and rail", true],
  ["Water and green", true],
  ["Trees", false],
  ["Terrain", true],
  ["Contours", false],
]) {
  await setLayer(page, label, on);
}
await page.getByRole("button", { name: "Create model" }).click();
await page.waitForSelector(".model .scene-canvas", { timeout: 360_000 });
await page.waitForFunction(() => document.body.classList.contains("citycut-intro-done") || !document.querySelector(".model"), {
  timeout: 120_000,
}).catch(() => {});
await page.waitForTimeout(3000);

await page.locator('.model button[data-section="analysis"]').first().click();
await page.getByRole("tab", { name: /Walk Ripple/i }).click();
await page.waitForFunction(
  () => document.querySelector('[data-walk-ripple-amenities-ready="true"]') !== null,
  { timeout: 90_000 },
);
await page.waitForTimeout(400);

await page.getByRole("button", { name: "Pick origin", exact: true }).click();
const canvas = page.locator(".scene-canvas");
const box = await canvas.boundingBox();
if (!box) throw new Error("scene canvas missing");

await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.55);
await page.waitForTimeout(9000);

const bench = await page.evaluate(() => {
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) {
    window.__citycutWalkRippleQa?.setMinutes(i * 0.1);
  }
  return { msPerRippleUpdate: (performance.now() - t0) / 200, counts: window.__citycutWalkRippleQa?.getAmenityCounts?.() ?? null };
});

const cafeChip = page.getByRole("button", { name: /Café/i }).first();
if (await cafeChip.isVisible()) {
  await cafeChip.click();
  await page.waitForTimeout(500);
  await cafeChip.click();
}

await page.mouse.click(box.x + box.width * 0.48, box.y + box.height * 0.5);
await page.waitForTimeout(800);

await page.screenshot({ path: SHOT, fullPage: false });

await page.getByRole("button", { name: /Replay walk ripple/i }).click();
await page.waitForTimeout(10_200);

const rawVideo = await page.video()?.path();
await context.close();
await browser.close();

if (rawVideo) renameSync(rawVideo, CLIP);
else throw new Error("Playwright video missing");

console.log(JSON.stringify({ screenshot: SHOT, clip: CLIP, bench, consoleErrors }, null, 2));

if (consoleErrors.filter((line) => !line.includes("502")).length > 0) process.exit(1);
