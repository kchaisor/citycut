/**
 * Site boundary QA: 3D oblique + site plan for an address frame.
 * Run: npx vite-node scripts/capture-site-screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const ADDRESS = "1022 Whitehorse Road, Box Hill VIC 3128";
const LAT = -37.8187756;
const LON = 145.1266505;
const KM = 0.4;
const EYE_Y = 250;
const HORIZONTAL_BACK_M = 400;
const DEPRESSION_DEG = 40;

function cameraPose() {
  const target = { x: 0, y: 4, z: 0 };
  const back = HORIZONTAL_BACK_M;
  const dy = EYE_Y - target.y;
  const horizontal = dy / Math.tan((DEPRESSION_DEG * Math.PI) / 180);
  const scale = horizontal / back;
  return {
    eye: {
      x: target.x - back * 0.707106 * scale,
      y: EYE_Y,
      z: target.z - back * 0.707106 * scale,
    },
    look: target,
  };
}

const label = encodeURIComponent(ADDRESS);
const frameUrl = `http://127.0.0.1:5173/citycut-export/?qa=1&lat=${LAT}&lon=${LON}&km=${KM}&label=${label}`;

const parcelFixture = JSON.parse(
  readFileSync(new URL("./fixtures/box-hill-parcel-response.json", import.meta.url), "utf8"),
);

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(240_000);

await page.route(/Vicmap_Parcel\/FeatureServer\/0\/query/i, async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(parcelFixture),
  });
});

await page.goto(frameUrl, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

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
  ["Trees", false],
  ["Terrain", true],
  ["Contours", false],
]) {
  await setLayer(name, on);
}

await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 240_000 });
await page.waitForTimeout(8000);

await page.getByRole("button", { name: "Summary", exact: true }).click().catch(() => {});
const meta = await page.evaluate(() => {
  const note = document.querySelector(".meta")?.textContent ?? "";
  const params = new URLSearchParams(window.location.search);
  const parcelMatch = note.match(/Site parcel ([^.]+)\./);
  return {
    note: note.slice(0, 500),
    url: window.location.href,
    siteLat: params.get("siteLat"),
    siteLon: params.get("siteLon"),
    label: params.get("label"),
    parcelPfi: parcelMatch?.[1] ?? null,
  };
});

await page.waitForFunction(() => window.__citycutQa?.setCamera, null, { timeout: 60_000 });
const pose = cameraPose();
await page.evaluate((p) => {
  window.__citycutQa?.setCamera({ eye: p.eye, target: p.look });
}, pose);
await page.waitForTimeout(4000);

const shot3d = `${outDir}/site-box-hill-3d.png`;
await page.locator(".viewport canvas").screenshot({ path: shot3d });

await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("tab", { name: "Drawing" }).click();
await page.waitForSelector(".fill.is-plan svg", { timeout: 60_000 });
await page.waitForTimeout(1500);
const shotPlan = `${outDir}/site-box-hill-plan.png`;
await page.locator(".fill.is-plan svg").screenshot({ path: shotPlan });

writeFileSync(
  `${outDir}/site-capture-meta.json`,
  JSON.stringify({ address: ADDRESS, lat: LAT, lon: LON, km: KM, ...meta, pose, shot3d, shotPlan }, null, 2),
);

await browser.close();
console.log(JSON.stringify({ address: ADDRESS, parcelPfi: meta.parcelPfi, shot3d, shotPlan }, null, 2));
