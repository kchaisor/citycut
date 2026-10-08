import { readFileSync, writeFileSync } from "node:fs";
import { planPaths } from "../src/lib/svgPlan.ts";
import { signedArea } from "../src/lib/geo.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";

const model = JSON.parse(readFileSync(process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json", "utf8"));
clearFootpathUnionCacheForTests();
const plan = planPaths(model, undefined, 5, 500, 5, 2500, { pathFilletM: 2 });

const rails = model.roads.filter((r) => r.kind === "rail");
let railY = 0;
let railN = 0;
for (const r of rails) {
  for (const p of r.line) {
    railY += p[1];
    railN++;
  }
}
railY /= Math.max(1, railN);

function ringBounds(ring) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const x = ring[i][0];
    const y = ring[i][1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY, spanX: maxX - minX, spanY: maxY - minY };
}

let best = null;
for (const poly of plan.greenOnRoad) {
  const ring = poly[0];
  if (!ring || ring.length < 4) continue;
  const bounds = ringBounds(ring);
  const area = Math.abs(signedArea(ring));
  if (area < 40 || area > 800) continue;
  const elong = bounds.spanX / Math.max(1, bounds.spanY);
  if (elong < 2.5) continue;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const score = Math.abs(cy - railY) + Math.abs(elong - 6) * 2;
  if (!best || score < best.score) best = { cx, cy, score, area, elong, bounds };
}

function vbAround(east, north, w, h, padX, padY) {
  const svgY = -north;
  return `${Math.round(east - padX)} ${Math.round(svgY - padY)} ${w} ${h}`;
}

const roadGaps = best
  ? vbAround(best.cx, best.cy, 55, 35, 28, 18)
  : "-139 127 50 35";

console.log(JSON.stringify({ best, roadGaps }, null, 2));

const cropFile = "/opt/cursor/artifacts/kelvin-jolimont-crops.json";
const crops = JSON.parse(readFileSync(cropFile, "utf8"));
crops.roadGaps = roadGaps;
writeFileSync(cropFile, JSON.stringify(crops, null, 2));
