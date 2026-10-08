/**
 * Contact sheet of top-10 nib candidates (main-style / faceted footpaths).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { planPaths, svgRings, svgPolyline } from "../src/lib/svgPlan.ts";
import { DEFAULT_LINE_STYLES, footpathEdgeSvgAttrs } from "../src/lib/drawingStyle.ts";
import { getColour } from "../src/lib/colours.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";

const model = JSON.parse(readFileSync(process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json", "utf8"));
const crops = JSON.parse(readFileSync("/opt/cursor/artifacts/kelvin-jolimont-crops.json", "utf8"));
const candidates = crops.nibCandidates ?? crops.candidates ?? [];

clearFootpathUnionCacheForTests();
const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, smoothOutput: false });
const style = { ...DEFAULT_LINE_STYLES, pathEdgeOn: true, pathFilletM: 2 };
const sheet = getColour("--sheet-fill");
const greenFill = getColour("--green-fill");
const pathD = plan.pathFill.map((p) => svgRings(p)).join(" ");
const roadD = plan.roadFill.map((p) => svgRings(p)).join(" ");
const greenD = plan.green.map((rings) => svgRings(rings)).join(" ");
const edge = footpathEdgeSvgAttrs(style, "round");
const pathStroke =
  edge.stroke === "none" ? "" : `stroke="${edge.stroke}" stroke-width="0.12" vector-effect="non-scaling-stroke"`;

const cols = 5;
const rows = 2;
const cell = 180;
const tiles = candidates.slice(0, 10).map((c, i) => {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const tx = col * cell;
  const ty = row * cell;
  const [vx, vy, vw, vh] = c.viewBox.split(" ").map(Number);
  return `<g transform="translate(${tx} ${ty})">
    <rect width="${cell}" height="${cell}" fill="#fff" stroke="#ccc"/>
    <svg x="10" y="10" width="${cell - 20}" height="${cell - 40}" viewBox="${c.viewBox}">
      <rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="${sheet}"/>
      ${greenD ? `<path d="${greenD}" fill="${greenFill}"/>` : ""}
      ${roadD ? `<path d="${roadD}" fill="${style.roadFill}"/>` : ""}
      ${pathD ? `<path d="${pathD}" fill="${style.pathFill}" ${pathStroke}/>` : ""}
    </svg>
    <text x="8" y="${cell - 8}" font-size="10" fill="#333">#${i + 1} s=${Math.round(c.kelvinScore ?? c.score)}</text>
  </g>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}">
  ${tiles.join("")}
</svg>`;

writeFileSync("/opt/cursor/artifacts/path-kink-candidates.svg", svg);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: cols * cell, height: rows * cell } });
await page.setContent(svg);
await page.screenshot({ path: "/opt/cursor/artifacts/path-kink-candidates.png" });
await browser.close();
console.log("wrote path-kink-candidates.png", candidates.length);
