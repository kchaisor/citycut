/**
 * QA for B5 batch. Requires preview: npm run build && npm run preview -- --host 127.0.0.1 --port 4173
 */
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
import { fetchOvertureTransportationForCut } from "../src/lib/overtureTransportation.ts";
import { squareBBox, toLocal } from "../src/lib/geo.ts";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

function renderRoadsPlateSvg(model, settings, tag) {
  const { layers, guides } = buildExplodedAxoLayers(model, settings);
  const colours = axoLayerColours();
  const bounds = explodedAxoBounds(model, settings);
  const roads = layers.find((l) => l.id === "roads");
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}" width="1200" height="900" style="background:#ebebeb">`,
  ];
  for (const guide of guides) {
    parts.push(
      `<line x1="${guide.x}" y1="${guide.yTop}" x2="${guide.x}" y2="${guide.yBottom}" stroke="${colours.guide}" stroke-width="0.6" stroke-dasharray="4 3"/>`,
    );
  }
  layers.forEach((layer, index) => {
    if (layer.id !== "roads" && layer.id !== "green") return;
    const fill = layer.id === "green" ? colours.green : colours.plate;
    parts.push(`<g clip-path="url(#c${index})">`);
    parts.push(`<clipPath id="c${index}"><path d="${layer.clipD}"/></clipPath>`);
    parts.push(`<path d="${layer.plateOutlineD}" fill="${fill}" fill-opacity="${layer.id === "green" ? 0.35 : 1}"/>`);
    if (layer.id === "roads") {
      for (const d of layer.strokes) {
        parts.push(`<path d="${d}" fill="none" stroke="${colours.roads}" stroke-width="2.2" stroke-linecap="round"/>`);
      }
    }
    parts.push(`</g>`);
    if (layer.id === "roads") {
      const anchor = { x: bounds.maxX + 8, y: layer.liftM * 0 + bounds.minY + 40 };
      parts.push(
        `<text x="${anchor.x}" y="${anchor.y}" fill="${colours.label}" font-family="Outfit,sans-serif" font-size="14">${AXO_LAYER_LABELS.roads}</text>`,
      );
    }
  });
  parts.push("</svg>");
  writeFileSync(`${outDir}/b5-axo-roads-${tag}.svg`, parts.join("\n"));
}

async function fitzroyModel() {
  const center = { lat: -37.8146, lon: 144.9788 };
  const sideM = 600;
  const bbox = squareBBox(center.lat, center.lon, sideM);
  const transport = await fetchOvertureTransportationForCut(bbox, center, sideM);
  return {
    placeLabel: "Fitzroy Gardens",
    center,
    sideM,
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
    buildings: [],
    roads: transport.roads,
    areas: [
      {
        id: 1,
        ring: [
          [-280, -280],
          [280, -280],
          [280, 280],
          [-280, 280],
          [-280, -280],
        ],
        holes: [],
        kind: "green",
      },
    ],
    trees: [],
    roadKm: transport.roadKm,
    buildingCapHit: false,
    sourceNote: "QA",
  };
}

function clipAllNonRail(model) {
  const roads = model.roads.filter((r) => r.kind !== "rail");
  return { ...model, roads };
}

const settings = defaultExplodedAxoSettings(600);
const live = await fitzroyModel();
renderRoadsPlateSvg(clipAllNonRail(live), settings, "before");
renderRoadsPlateSvg(live, settings, "after");

const base = "http://127.0.0.1:4173/citycut/";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});

async function cropPng(path, box, dest) {
  const buf = await import("node:fs/promises").then((fs) => fs.readFile(path));
  const png = PNG.sync.read(buf);
  const { x, y, width, height } = box;
  const out = new PNG({ width, height });
  PNG.bitblt(png, out, x, y, 0, 0, width, height);
  writeFileSync(dest, PNG.sync.write(out));
}

const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

// (b) Building panel — CBD
await page.goto(`${base}?qa=1&view=persp&lat=-37.8136&lon=144.9631&km=0.5`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.waitForFunction(() => window.__citycutQaModel?.pickForegroundBuildingForSelectionQa?.(), { timeout: 120_000 });
await page.evaluate(() => window.__citycutQaModel?.pickForegroundBuildingForSelectionQa?.());
await page.waitForSelector(".building-detail-panel", { timeout: 15_000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/b5-building-panel-cbd.png` });

// Site plan — Flinders / Swanston corridor
await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.waitForTimeout(1500);
await page.goto(`${base}?qa=1&view=persp&lat=-37.8183&lon=144.9670&km=0.35`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${outDir}/b5-site-plan-flinders-full.png` });
await cropPng(`${outDir}/b5-site-plan-flinders-full.png`, { x: 420, y: 320, width: 560, height: 280 }, `${outDir}/b5-road-median-filled.png`);

// Contours vs roads — Fitzroy / Wellington Pde
await page.goto(`${base}?qa=1&view=persp&lat=-37.8148&lon=144.9845&km=0.45`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.waitForTimeout(5000);
await page.screenshot({ path: `${outDir}/b5-contours-roads-full.png` });
await cropPng(`${outDir}/b5-contours-roads-full.png`, { x: 480, y: 200, width: 520, height: 420 }, `${outDir}/b5-contours-under-roads.png`);

// Green without internal edges — Fitzroy Gardens
await page.goto(`${base}?qa=1&view=persp&lat=-37.8146&lon=144.9788&km=0.35`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
await page.locator("button.create-fab").click();
await page.waitForSelector(".model-chrome", { timeout: 600_000 });
await page.getByRole("button", { name: "Drawing", exact: true }).click();
await page.getByRole("button", { name: "Site plan", exact: true }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${outDir}/b5-green-full.png` });
await cropPng(`${outDir}/b5-green-full.png`, { x: 380, y: 180, width: 520, height: 480 }, `${outDir}/b5-green-no-edges.png`);

// Exploded axo roads after (live UI)
await page.getByRole("button", { name: "Exploded axo", exact: true }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/b5-axo-roads-after-ui.png` });
await cropPng(`${outDir}/b5-axo-roads-after-ui.png`, { x: 320, y: 120, width: 760, height: 680 }, `${outDir}/b5-axo-roads-after.png`);

await browser.close();

// Rasterise before SVG for PNG review (playwright)
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
await p.setContent(await import("node:fs/promises").then((fs) => fs.readFile(`${outDir}/b5-axo-roads-before.svg`, "utf8")));
await p.screenshot({ path: `${outDir}/b5-axo-roads-before.png` });
await p.setContent(await import("node:fs/promises").then((fs) => fs.readFile(`${outDir}/b5-axo-roads-after.svg`, "utf8")));
await p.screenshot({ path: `${outDir}/b5-axo-roads-after-render.png` });
await b.close();

console.log("B5 QA artifacts written to", outDir);
