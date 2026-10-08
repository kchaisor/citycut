import { readFileSync, writeFileSync } from "node:fs";
import {
  clearFootpathUnionCacheForTests,
  footpathStrips,
  unionFootpathStrips,
} from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const modelPath = process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json";
const model = JSON.parse(readFileSync(modelPath, "utf8"));

function openRing(ring) {
  if (
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
  ) {
    return ring.slice(0, -1);
  }
  return ring;
}

function distPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function minDistToPolyline(line, px, py) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    best = Math.min(
      best,
      distPointToSegment(px, py, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]),
    );
  }
  return best;
}

clearFootpathUnionCacheForTests();
const strips = footpathStrips(model.roads, PATH_WIDTH_M);
const unioned = unionFootpathStrips(strips, model.sideM, model.frameShape ?? "square", 2, PATH_WIDTH_M);
const multi = unioned.polygons;

const centre = [-27.5, -148.5];
let best = null;

for (const polygon of multi) {
  const outer = openRing(polygon[0] || []);
  for (const [x, y] of outer) {
    if (Math.hypot(x - centre[0], y - centre[1]) > 45) continue;
    let minD = Infinity;
    for (const strip of strips) {
      minD = Math.min(minD, minDistToPolyline(strip.line, x, y));
    }
    const bulge = minD - PATH_WIDTH_M / 2;
    if (bulge > 0.08 && (!best || bulge > best.bulge)) best = { pt: [x, y], bulge };
  }
}

const pathKink = best
  ? `${Math.round(best.pt[0] - 9)} ${Math.round(-best.pt[1] - 9)} 18 18`
  : "-36 130 18 18";

console.log(JSON.stringify({ best, pathKink }, null, 2));

const cropFile = "/opt/cursor/artifacts/kelvin-jolimont-crops.json";
const crops = JSON.parse(readFileSync(cropFile, "utf8"));
crops.pathKink = pathKink;
writeFileSync(cropFile, JSON.stringify(crops, null, 2));
