import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import {
  buildExplodedAxoLayers,
  defaultExplodedAxoSettings,
  axoLayerColours,
  AXO_LAYER_LABELS,
  explodedAxoBounds,
} from "../src/lib/explodedAxo.ts";
function fixtureModel() {
  return {
    placeLabel: "Test Block",
    center: { lat: -37.8136, lon: 144.9631 },
    sideM: 100,
    layers: { buildings: true, roads: true, waterGreen: true, trees: true },
    buildings: [
      {
        id: 1,
        ring: [
          [-20, -20],
          [20, -20],
          [20, 20],
          [-20, 20],
          [-20, -20],
        ],
        holes: [],
        height: 12,
        use: "residential",
        source: "osm_tag",
      },
    ],
    roads: [
      { id: 2, line: [[-40, 0], [40, 0]], width: 8, kind: "road", grade: "arterial" },
      { id: 5, line: [[-30, -20], [30, -20]], width: 2, kind: "road", grade: "path" },
      { id: 6, line: [[10, -40], [10, 40]], width: 3.2, kind: "rail" },
    ],
    areas: [
      {
        id: 3,
        ring: [
          [-45, -45],
          [-30, -45],
          [-30, -30],
          [-45, -30],
          [-45, -45],
        ],
        holes: [],
        kind: "green",
      },
    ],
    trees: [],
    roadKm: 0.16,
    buildingCapHit: false,
    sourceNote: "QA",
  };
}

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

async function cropPng(path, box, dest) {
  const buf = await import("node:fs/promises").then((fs) => fs.readFile(path));
  const png = PNG.sync.read(buf);
  const { x, y, width, height } = box;
  const out = new PNG({ width, height });
  PNG.bitblt(png, out, x, y, 0, 0, width, height);
  writeFileSync(dest, PNG.sync.write(out));
}

function renderRoadsPlate(model, tag) {
  const settings = defaultExplodedAxoSettings(model.sideM);
  const { layers, guides } = buildExplodedAxoLayers(model, settings);
  const colours = axoLayerColours();
  const bounds = explodedAxoBounds(model, settings);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}" width="1200" height="900" style="background:#ebebeb">`,
  ];
  for (const guide of guides) {
    parts.push(
      `<line x1="${guide.x}" y1="${guide.yTop}" x2="${guide.x}" y2="${guide.yBottom}" stroke="${colours.guide}" stroke-width="0.6" stroke-dasharray="4 3"/>`,
    );
  }
  for (const layer of layers) {
    if (layer.id !== "roads" && layer.id !== "green") continue;
    parts.push(`<g>`);
    parts.push(`<path d="${layer.plateOutlineD}" fill="${layer.id === "green" ? colours.green : colours.plate}" fill-opacity="${layer.id === "green" ? 0.4 : 1}"/>`);
    if (layer.id === "roads") {
      for (const d of layer.strokes) {
        parts.push(`<path d="${d}" fill="none" stroke="${colours.roads}" stroke-width="2.4" stroke-linecap="round"/>`);
      }
      parts.push(
        `<text x="${bounds.maxX + 6}" y="${bounds.minY + 48}" fill="${colours.label}" font-family="sans-serif" font-size="16">${AXO_LAYER_LABELS.roads}</text>`,
      );
    }
    parts.push(`</g>`);
  }
  parts.push("</svg>");
  writeFileSync(`${outDir}/b5-axo-roads-${tag}.svg`, parts.join("\n"));
}

const baseModel = fixtureModel();
renderRoadsPlate(
  {
    ...baseModel,
    roads: baseModel.roads.filter((r) => r.kind !== "rail"),
  },
  "before",
);
renderRoadsPlate(baseModel, "after");

const base = "http://127.0.0.1:4173/citycut/";
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

async function openSitePlan(lat, lon, km) {
  await page.goto(`${base}?qa=1&view=persp&lat=${lat}&lon=${lon}&km=${km}`, {
    waitUntil: "networkidle",
    timeout: 180_000,
  });
  await page.getByRole("button", { name: "Create model" }).click({ timeout: 60_000 });
  await page.waitForSelector(".model-chrome", { timeout: 600_000 });
  await page.waitForTimeout(45_000);
  await page.locator(".icon-rail").getByRole("button", { name: "Drawing" }).click();
  await page.getByRole("tab", { name: "Drawing" }).click();
  await page.getByRole("group", { name: "Drawing type" }).getByRole("button", { name: "Site plan" }).click();
  await page.waitForSelector("svg.plan:not(.figure-ground)", { timeout: 120_000 });
  await page.waitForTimeout(5000);
}

await openSitePlan(-37.8183, 144.9670, 0.35);
await page.screenshot({ path: `${outDir}/b5-site-plan-flinders-full.png` });
await cropPng(`${outDir}/b5-site-plan-flinders-full.png`, { x: 350, y: 280, width: 620, height: 320 }, `${outDir}/b5-road-median-filled.png`);

await openSitePlan(-37.8148, 144.9845, 0.45);
await page.screenshot({ path: `${outDir}/b5-contours-roads-full.png` });
await cropPng(`${outDir}/b5-contours-roads-full.png`, { x: 420, y: 160, width: 560, height: 460 }, `${outDir}/b5-contours-under-roads.png`);

await openSitePlan(-37.8146, 144.9788, 0.35);
await page.screenshot({ path: `${outDir}/b5-green-full.png` });
await cropPng(`${outDir}/b5-green-full.png`, { x: 320, y: 140, width: 580, height: 520 }, `${outDir}/b5-green-no-edges.png`);

await page.getByRole("button", { name: "Exploded axo", exact: true }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${outDir}/b5-axo-roads-after-ui.png` });
await cropPng(`${outDir}/b5-axo-roads-after-ui.png`, { x: 280, y: 100, width: 820, height: 720 }, `${outDir}/b5-axo-roads-after.png`);

await browser.close();

const b = await chromium.launch({ headless: true });
const p = await b.newPage();
for (const tag of ["before", "after"]) {
  const svg = await import("node:fs/promises").then((fs) => fs.readFile(`${outDir}/b5-axo-roads-${tag}.svg`, "utf8"));
  await p.setContent(svg);
  await p.screenshot({ path: `${outDir}/b5-axo-roads-${tag}.png` });
}
await b.close();
console.log("done");
