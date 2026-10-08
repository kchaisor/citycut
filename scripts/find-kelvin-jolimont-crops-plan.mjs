/**
 * Pick Kelvin QA viewBoxes from plan geometry (Jolimont 1 km).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { signedArea, openRing } from "../src/lib/geo.ts";
import { planPaths } from "../src/lib/svgPlan.ts";
import { footpathLines, clearFootpathUnionCacheForTests, unionFootpathStrips, footpathStrips } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const model = JSON.parse(readFileSync(process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json", "utf8"));
const half = model.sideM / 2;

function vbAround(east, north, w, h) {
  const svgY = -north;
  return `${Math.round(east - w / 2)} ${Math.round(svgY - h / 2)} ${Math.round(w)} ${Math.round(h)}`;
}

function ringArea(ring) {
  return Math.abs(signedArea(openRing(ring)));
}

function ringCentroid(ring) {
  let x = 0;
  let y = 0;
  const n = ring.length;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  return [x / n, y / n];
}

function distPointSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len * len)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function pathNearGreen(greenOuter, pathMulti, maxD = 3.5) {
  let hits = 0;
  for (const polygon of pathMulti) {
    for (const ring of polygon) {
      for (const [x, y] of ring.slice(0, -1)) {
        let minD = Infinity;
        const open = greenOuter.slice(0, -1);
        for (let i = 0; i < open.length; i++) {
          const a = open[i];
          const b = open[(i + 1) % open.length];
          minD = Math.min(minD, distPointSeg(x, y, a[0], a[1], b[0], b[1]));
        }
        if (minD <= maxD) hits++;
      }
    }
  }
  return hits;
}

clearFootpathUnionCacheForTests();
const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });

const rails = model.roads.filter((r) => r.kind === "rail");
let railY = 0;
let railN = 0;
for (const r of rails) {
  for (const p of r.line) railY += p[1];
  railN += r.line.length;
}
railY /= Math.max(1, railN);

/** Image 1: large west-side park with tan path around its edge; curving white road on the east. */
let facet = null;
for (const rings of plan.green) {
  const outer = rings[0];
  if (!outer || ringArea(outer) < 8000) continue;
  const [cx, cy] = ringCentroid(outer);
  if (cx > -150 || Math.abs(cy - railY) > 75) continue;
  const pathHits = pathNearGreen(outer, plan.pathFill);
  if (pathHits < 12) continue;
  let roadEast = -Infinity;
  let roadNear = 0;
  for (const poly of plan.roadFill) {
    for (const p of poly[0]?.slice(0, -1) ?? []) {
      if (Math.abs(p[1] - cy) > 80) continue;
      if (p[0] > cx + 5) {
        roadEast = Math.max(roadEast, p[0]);
        roadNear++;
      }
    }
  }
  if (roadEast < cx + 20 || roadNear < 15) continue;
  const score = ringArea(outer) + pathHits * 40 - Math.abs(cy - railY) * 3;
  if (!facet || score > facet.score) facet = { cx, cy, score, roadEast, pathHits };
}

const facetSpot = facet ? vbAround(facet.cx + 35, facet.cy, 80, 80) : "-55 120 75 75";

/** Kerb return: sharpest convex road corner east of the park, on the curving carriageway. */
let kerb = null;
for (const poly of plan.roadFill) {
  const open = poly[0]?.slice(0, -1) ?? [];
  for (let i = 1; i < open.length - 1; i++) {
    const p = open[i];
    if (!p) continue;
    if (Math.abs(p[0]) > half - 8 || Math.abs(p[1]) > half - 8) continue;
    if (facet) {
      if (p[0] < facet.cx + 10 || p[0] > facet.roadEast - 15) continue;
      if (Math.abs(p[1] - facet.cy) > 45) continue;
    }
    const prev = open[i - 1];
    const next = open[i + 1];
    const v1 = [p[0] - prev[0], p[1] - prev[1]];
    const v2 = [next[0] - p[0], next[1] - p[1]];
    const a1 = Math.atan2(v1[1], v1[0]);
    const a2 = Math.atan2(v2[1], v2[0]);
    let turn = Math.abs(a2 - a1);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    if (turn > 0.15 && turn < 1.3 && (!kerb || turn > kerb.turn)) kerb = { p, turn };
  }
}
const kerbReturn = kerb ? vbAround(kerb.p[0], kerb.p[1], 18, 18) : "40 125 18 18";

/** Image 2: elongated green median on Wellington Pde (near rail). */
let roadGapsBest = null;
for (const rings of plan.greenOnRoad) {
  const ring = rings[0];
  if (!ring) continue;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of ring.slice(0, -1)) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const area = ringArea(ring);
  if (area < 40 || spanX / Math.max(1, spanY) < 2.2) continue;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const score = Math.abs(cy - railY) * 0.5 + Math.abs(spanX / Math.max(spanY, 1) - 5) * 3;
  if (!roadGapsBest || score < roadGapsBest.score) roadGapsBest = { cx, cy, score };
}
const roadGaps = roadGapsBest ? vbAround(roadGapsBest.cx, roadGapsBest.cy, 55, 35) : "284 126 55 35";

/** Image 3: path T-junction nib on the outer edge of the main path, beside grey paper. */
clearFootpathUnionCacheForTests();
const strips = footpathStrips(model.roads, PATH_WIDTH_M);
const unioned = unionFootpathStrips(strips, model.sideM, model.frameShape ?? "square", 2, PATH_WIDTH_M);
const lines = footpathLines(model.roads);
const kinkCentre = facet ? [facet.cx + 55, facet.cy - 35] : [-25, railY];
let kink = null;
for (const poly of unioned.polygons) {
  const outer = poly[0]?.slice(0, -1) ?? [];
  for (const [x, y] of outer) {
    if (Math.hypot(x - kinkCentre[0], y - kinkCentre[1]) > 50) continue;
    let minD = Infinity;
    for (const line of lines) {
      for (let i = 0; i < line.length - 1; i++) {
        minD = Math.min(
          minD,
          distPointSeg(x, y, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]),
        );
      }
    }
    const bulge = minD - PATH_WIDTH_M / 2;
    const edgeDist = Math.min(half - Math.abs(x), half - Math.abs(y));
    const score = bulge + (edgeDist < 25 ? 0.15 : 0);
    if (bulge > 0.04 && (!kink || score > kink.score)) {
      kink = { x, y, bulge, score, edgeDist };
    }
  }
}
const pathKink = kink ? vbAround(kink.x, kink.y, 24, 24) : "-25 138 24 24";

const out = { facetSpot, kerbReturn, roadGaps, pathKink, facet, kerb, roadGapsBest, kink, railY };
writeFileSync("/opt/cursor/artifacts/kelvin-jolimont-crops.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
