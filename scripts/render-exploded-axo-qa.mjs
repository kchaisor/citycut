import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { buildExplodedAxoLayers, defaultExplodedAxoSettings, axoLayerColours, AXO_LAYER_LABELS, explodedAxoBounds, isoSatelliteImageTransform } from "../src/lib/explodedAxo.ts";

function testModel(shape) {
  return {
    placeLabel: "Melbourne CBD",
    center: { lon: 144.9631, lat: -37.8136 },
    sideM: 500,
    frameShape: shape,
    layers: { buildings: true, roads: true, waterGreen: true, trees: false },
    buildings: [
      {
        id: 1,
        ring: [
          [-40, -40],
          [40, -40],
          [40, 40],
          [-40, 40],
          [-40, -40],
        ],
        holes: [],
        height: 12,
        use: "residential",
        source: "osm_tag",
      },
      {
        id: 2,
        ring: [
          [60, 20],
          [90, 20],
          [90, 50],
          [60, 50],
          [60, 20],
        ],
        holes: [],
        height: 24,
        use: "commercial",
        source: "osm_tag",
      },
    ],
    roads: [
      { id: 3, line: [[-200, 0], [200, 0]], width: 10, kind: "road", grade: "arterial" },
      { id: 4, line: [[0, -200], [0, 200]], width: 6, kind: "road", grade: "local" },
    ],
    areas: [
      { id: 5, ring: [[-220, -220], [-120, -220], [-120, -120], [-220, -120], [-220, -220]], holes: [], kind: "green" },
      { id: 6, ring: [[120, 120], [200, 120], [200, 200], [120, 200], [120, 120]], holes: [], kind: "water" },
    ],
    trees: [],
    roadKm: 0.8,
    buildingCapHit: false,
    sourceNote: "QA fixture",
  };
}

function renderSvg(model, settings) {
  const { layers, guides } = buildExplodedAxoLayers(model, settings);
  const colours = axoLayerColours();
  const bounds = explodedAxoBounds(model, settings);
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}" width="1200" height="900" style="background:#ebebeb">`,
  );
  for (const guide of guides) {
    parts.push(`<line x1="${guide.x}" y1="${guide.yTop}" x2="${guide.x}" y2="${guide.yBottom}" stroke="${colours.guide}" stroke-width="0.6"/>`);
  }
  layers.forEach((layer, index) => {
    const fill =
      layer.id === "water"
        ? colours.water
        : layer.id === "roads"
          ? colours.roads
          : layer.id === "green"
            ? colours.green
            : colours.buildings;
    parts.push(`<g clip-path="url(#c${index})">`);
    parts.push(`<clipPath id="c${index}"><path d="${layer.clipD}"/></clipPath>`);
    parts.push(`<path d="${layer.plateOutlineD}" fill="${colours.plate}"/>`);
    for (const d of layer.fills) parts.push(`<path d="${d}" fill="${fill}" fill-rule="evenodd"/>`);
    for (const d of layer.strokes) parts.push(`<path d="${d}" fill="none" stroke="${fill}" stroke-width="1.5"/>`);
    parts.push(`<path d="${layer.plateOutlineD}" fill="none" stroke="${colours.guide}" stroke-width="0.8"/>`);
    parts.push(`<text x="${model.sideM * 0.35}" y="${layer.liftM - 8}" fill="${colours.label}" font-family="sans-serif" font-size="14">${AXO_LAYER_LABELS[layer.id]}</text>`);
    parts.push("</g>");
  });
  parts.push("</svg>");
  return parts.join("");
}

async function screenshot(shape, outPath) {
  const model = testModel(shape);
  const settings = defaultExplodedAxoSettings(model.sideM);
  const svg = renderSvg(model, settings);
  writeFileSync(outPath.replace(/\.png$/, ".svg"), svg);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#ebebeb">${svg}</body></html>`);
  await page.screenshot({ path: outPath });
  await browser.close();
  console.log("saved", outPath);
}

await screenshot("square", "/opt/cursor/artifacts/exploded-axo-square-0.5km.png");
await screenshot("circle", "/opt/cursor/artifacts/exploded-axo-circle-0.5km.png");
