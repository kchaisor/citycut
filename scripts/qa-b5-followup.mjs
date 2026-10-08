/**
 * Follow-up QA: live footpath junction + contours over roads.
 * npm run build && npm run preview -- --host 127.0.0.1 --port 4173
 * npx vite-node scripts/qa-b5-followup.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { squareBBox } from "../src/lib/geo.ts";
import { fetchOvertureTransportationForCut } from "../src/lib/overtureTransportation.ts";
import {
  clearFootpathUnionCacheForTests,
  footpathLines,
  unionFootpaths,
} from "../src/lib/roadFill.ts";
import { DEFAULT_LINE_STYLES } from "../src/lib/drawingStyle.ts";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });
const base = "http://127.0.0.1:4173/citycut/";

function crop(path, box, dest) {
  const buf = readFileSync(path);
  const png = PNG.sync.read(buf);
  const out = new PNG({ width: box.width, height: box.height });
  PNG.bitblt(png, out, box.x, box.y, 0, 0, box.width, box.height);
  writeFileSync(dest, PNG.sync.write(out));
}

function hstack(paths, dest, gap = 8) {
  const images = paths.map((p) => PNG.sync.read(readFileSync(p)));
  const height = Math.max(...images.map((i) => i.height));
  const width = images.reduce((sum, img) => sum + img.width, gap * (images.length - 1));
  const out = new PNG({ width, height });
  out.data.fill(0xf5, 0xf5, 0xf5, 255);
  let x = 0;
  for (const img of images) {
    PNG.bitblt(img, out, 0, 0, img.width, img.height, x, 0);
    x += img.width + gap;
  }
  writeFileSync(dest, PNG.sync.write(out));
}

clearFootpathUnionCacheForTests();
const gridLines = [];
for (let i = -900; i <= 900; i += 45) {
  gridLines.push([
    [-900, i],
    [900, i],
  ]);
  gridLines.push([
    [i, -900],
    [i, 900],
  ]);
}
const gridStarted = performance.now();
unionFootpaths(gridLines, 1.2, 2000, "square", 2);
const gridUnionMs = Math.round(performance.now() - gridStarted);

const cbd = { lat: -37.8136, lon: 144.9631 };
const bbox2 = squareBBox(cbd.lat, cbd.lon, 2000);
const transport = await fetchOvertureTransportationForCut(bbox2, cbd, 2000);
const pathLines = footpathLines(transport.roads);
const pathWidth = DEFAULT_LINE_STYLES.pathWidthM;
clearFootpathUnionCacheForTests();
const liveStarted = performance.now();
const liveUnion = unionFootpaths(pathLines, pathWidth, 2000, "square", 2);
const liveUnionMs = Math.round(performance.now() - liveStarted);

const benchText = [
  `synthetic_2km_grid_union_ms=${gridUnionMs}`,
  `overture_2km_footpath_union_ms=${liveUnionMs}`,
  `overture_footpath_centrelines=${pathLines.length}`,
  `overture_footpath_inputs=${liveUnion.inputs}`,
].join("\n");
writeFileSync(`${outDir}/b5-footpath-2km-union-ms.txt`, `${benchText}\n`);
console.log(benchText);

try {
  const createBench = JSON.parse(readFileSync("/opt/cursor/artifacts/bench-2km-create.json", "utf8"));
  writeFileSync(
    `${outDir}/b5-footpath-2km-union-ms.txt`,
    `${benchText}\ncreate_model_2km_wall_ms=${createBench.wallMsCreateToReady}\n`,
  );
} catch {
  /* optional bench-2km-create.json */
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

async function openSitePlan(page, lat, lon, km, { filletM = 2, pathEdgeOn = true } = {}) {
  await page.addInitScript(({ fillet, edgeOn }) => {
    document.documentElement.style.setProperty("--path-fillet-m", String(fillet));
    document.documentElement.style.setProperty("--path-edge", edgeOn ? "on" : "off");
    if (edgeOn) document.documentElement.style.setProperty("--path-edge-mm", "0.08");
  }, { fillet: filletM, edgeOn: pathEdgeOn });

  await page.goto(`${base}?qa=1&view=persp&lat=${lat}&lon=${lon}&km=${km}`, {
    waitUntil: "networkidle",
    timeout: 180_000,
  });
  await page.locator("button.create-fab").click();
  await page.waitForSelector(".model-chrome", { timeout: 600_000 });
  await page.waitForFunction(
    () => (window.__citycutQaModel?.getSummary()?.roadCount ?? 0) > 50,
    null,
    { timeout: 600_000 },
  );

  await page.locator(".model-chrome").getByRole("button", { name: "Drawing", exact: true }).click();
  const sitePlan = page.locator(".drawer-section:not([hidden])").getByRole("button", { name: "Site plan", exact: true });
  await sitePlan.waitFor({ state: "visible", timeout: 30_000 });
  await sitePlan.click();
  await page.waitForSelector(".fill.is-plan svg.plan:not(.figure-ground)", { timeout: 120_000 });
  await page.waitForTimeout(1500);
}

async function setPlanScale(page, scale) {
  await page.getByLabel("Plan scale", { exact: true }).selectOption(String(scale));
  await page.waitForTimeout(800);
}

async function zoomPlan(page, steps = 6) {
  const svg = page.locator(".fill.is-plan svg.plan");
  await svg.click({ position: { x: 980, y: 420 }, force: true });
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Equal");
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(600);
}

const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(120_000);

const footLat = -37.8155;
const footLon = 144.9665;
const footKm = 0.35;
const footCrop = { x: 480, y: 240, width: 520, height: 460 };

await openSitePlan(page, footLat, footLon, footKm, { filletM: 0, pathEdgeOn: true });
await setPlanScale(page, 1000);
await zoomPlan(page, 5);
await page.screenshot({ path: `${outDir}/b5-footpath-live-before-full.png` });
crop(`${outDir}/b5-footpath-live-before-full.png`, footCrop, `${outDir}/b5-footpath-junction-before.png`);

await openSitePlan(page, footLat, footLon, footKm, { filletM: 2, pathEdgeOn: true });
await setPlanScale(page, 1000);
await zoomPlan(page, 5);
await page.screenshot({ path: `${outDir}/b5-footpath-live-after-full.png` });
crop(`${outDir}/b5-footpath-live-after-full.png`, footCrop, `${outDir}/b5-footpath-junction-after.png`);

const fixtureRef = `${outDir}/b5-footpath-junction-fixture-after.png`;
hstack(
  [
    `${outDir}/b5-footpath-junction-before.png`,
    `${outDir}/b5-footpath-junction-after.png`,
    fixtureRef,
  ],
  `${outDir}/b5-footpath-junction-compare.png`,
);

await openSitePlan(page, -37.8142, 144.9848, 0.35, { filletM: 2, pathEdgeOn: false });
await page.waitForFunction(
  () => {
    const el = document.querySelector("[data-contour-lines]");
    return el && Number(el.getAttribute("data-contour-lines")) > 20;
  },
  null,
  { timeout: 180_000 },
);
await setPlanScale(page, 1000);
await zoomPlan(page, 8);
await page.screenshot({ path: `${outDir}/b5-contours-roads-full.png` });
crop(`${outDir}/b5-contours-roads-full.png`, { x: 360, y: 100, width: 680, height: 560 }, `${outDir}/b5-contours-under-roads.png`);

await browser.close();
console.log("Follow-up QA written to", outDir);
