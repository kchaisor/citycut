/**
 * Site boundary QA: 3D oblique + site plan for an address frame (live Vicmap).
 * Run: npx vite-node scripts/capture-site-screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

const ADDRESS = "1022 Whitehorse Road, Box Hill VIC 3128";
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

const baseUrl = "http://127.0.0.1:5173/citycut-export/?qa=1&buildings=uniform";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(240_000);

await page.goto(baseUrl, { waitUntil: "networkidle" });

await page.getByRole("button", { name: "Search", exact: true }).click();
const searchInput = page.getByRole("combobox", { name: /Search a place/i });
await searchInput.fill(ADDRESS);
await page.waitForTimeout(1200);
await page.getByRole("option").first().click();
await page.waitForTimeout(800);

await page.getByRole("button", { name: "Layers", exact: true }).click();
const slider = page.locator('input[type="range"]');
await slider.fill(String(KM));
await page.waitForTimeout(300);
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
  const note = Array.from(document.querySelectorAll(".meta"))
    .map((node) => node.textContent ?? "")
    .join(" ");
  const params = new URLSearchParams(window.location.search);
  const pfiMatch = note.match(/Site parcel PFI (\S+)/);
  const spiMatch = note.match(/SPI ([^.]+)\./);
  const site = window.__citycutQaSite;
  return {
    note: note.slice(0, 1200),
    url: window.location.href,
    siteLat: params.get("siteLat"),
    siteLon: params.get("siteLon"),
    label: params.get("label"),
    parcelPfi: site?.parcelPfi ?? pfiMatch?.[1] ?? null,
    parcelSpi: site?.parcelSpi ?? spiMatch?.[1] ?? null,
    siteBuildingIds: site?.siteBuildingIds ?? [],
    siteOverlaps: site?.overlaps ?? [],
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
  JSON.stringify({ address: ADDRESS, km: KM, ...meta, pose, shot3d, shotPlan }, null, 2),
);

await browser.close();
console.log(JSON.stringify({ address: ADDRESS, ...meta, shot3d, shotPlan }, null, 2));
