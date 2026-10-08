/**
 * Pick Kelvin QA viewBoxes from plan geometry (Jolimont 1 km).
 * Facet/kerb: Clarendon pocket south of the rail (SVG x 80–220, y −490…−380).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { signedArea, openRing } from "../src/lib/geo.ts";
import { planPaths } from "../src/lib/svgPlan.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";
import { findPathJunctionNibs, viewBoxAround } from "../src/lib/pathJunctionNib.ts";

const model = JSON.parse(readFileSync(process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json", "utf8"));
const half = model.sideM / 2;

/** ViewBox east / SVG y band for Kelvin's Clarendon curve pocket. */
const KELVIN_EAST = [80, 220];
const KELVIN_SVG_Y = [-490, -380];

function inKelvinBox(east, north) {
  const svgY = -north;
  return east >= KELVIN_EAST[0] && east <= KELVIN_EAST[1] && svgY >= KELVIN_SVG_Y[0] && svgY <= KELVIN_SVG_Y[1];
}

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
const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, smoothOutput: false });

const rails = model.roads.filter((r) => r.kind === "rail");
let railY = 0;
let railN = 0;
for (const r of rails) {
  for (const p of r.line) railY += p[1];
  railN += r.line.length;
}
railY /= Math.max(1, railN);

/** Park block inside the Clarendon curve with tan footpath on its edge. */
let facet = null;
for (const rings of plan.green) {
  const outer = rings[0];
  if (!outer || ringArea(outer) < 600 || ringArea(outer) > 25000) continue;
  const [cx, cy] = ringCentroid(outer);
  if (!inKelvinBox(cx, cy)) continue;
  if (cy < railY - 15) continue;
  const pathHits = pathNearGreen(outer, plan.pathFill);
  if (pathHits < 4) continue;
  let roadNear = 0;
  let roadMinEast = Infinity;
  for (const poly of plan.roadFill) {
    for (const p of poly[0]?.slice(0, -1) ?? []) {
      if (!inKelvinBox(p[0], p[1])) continue;
      if (p[0] > cx - 5) {
        roadNear++;
        roadMinEast = Math.min(roadMinEast, p[0]);
      }
    }
  }
  if (roadNear < 6) continue;
  const score = pathHits * 50 + ringArea(outer) * 0.02 + (cy - railY) * 2;
  if (!facet || score > facet.score) facet = { cx, cy, score, pathHits, roadMinEast };
}

let facetEast = 150;
let facetNorth = 430;
if (facet) {
  let pathCorner = [facet.cx - 18, facet.cy + 8];
  let bestD = Infinity;
  for (const polygon of plan.pathFill) {
    for (const p of polygon[0]?.slice(0, -1) ?? []) {
      if (!inKelvinBox(p[0], p[1])) continue;
      const d = Math.hypot(p[0] - facet.cx, p[1] - facet.cy);
      if (d < bestD) {
        bestD = d;
        pathCorner = [p[0], p[1]];
      }
    }
  }
  let roadPt = [facet.roadMinEast, facet.cy];
  bestD = Infinity;
  for (const poly of plan.roadFill) {
    for (const p of poly[0]?.slice(0, -1) ?? []) {
      if (!inKelvinBox(p[0], p[1])) continue;
      const d = Math.hypot(p[0] - pathCorner[0], p[1] - pathCorner[1]);
      if (d < bestD && p[0] >= pathCorner[0] - 5) {
        bestD = d;
        roadPt = [p[0], p[1]];
      }
    }
  }
  facetEast = (pathCorner[0] + roadPt[0]) / 2;
  facetNorth = (pathCorner[1] + roadPt[1]) / 2;
}
const facetSpot = vbAround(facetEast, facetNorth, 70, 70);

/** Rounded kerb return on a side street in the same pocket. */
let kerb = null;
for (const poly of plan.roadFill) {
  const open = poly[0]?.slice(0, -1) ?? [];
  for (let i = 1; i < open.length - 1; i++) {
    const p = open[i];
    if (!p || !inKelvinBox(p[0], p[1])) continue;
    if (Math.abs(p[0]) > half - 8 || Math.abs(p[1]) > half - 8) continue;
    const prev = open[i - 1];
    const next = open[i + 1];
    const v1 = [p[0] - prev[0], p[1] - prev[1]];
    const v2 = [next[0] - p[0], next[1] - p[1]];
    const l1 = Math.hypot(v1[0], v1[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    if (l1 > 8 || l2 > 8) continue;
    const a1 = Math.atan2(v1[1], v1[0]);
    const a2 = Math.atan2(v2[1], v2[0]);
    let turn = Math.abs(a2 - a1);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    if (turn > 0.2 && turn < 1.4 && (!kerb || turn > kerb.turn)) kerb = { p, turn };
  }
}
const kerbReturn = kerb ? vbAround(kerb.p[0], kerb.p[1], 20, 20) : vbAround(127, 496, 20, 20);

/** Elongated green median on Wellington Pde (near rail). */
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

/** Path kink from nib finder (merged by find-path-kink-nibs.mjs). */
const nibs = findPathJunctionNibs(plan.pathFill, 200);
const kelvinNibs = nibs.filter((n) => inKelvinBox(n.east, n.north));
const pathKinkNib = kelvinNibs[0] ?? nibs[0];
const pathKink = pathKinkNib ? viewBoxAround(pathKinkNib.east, pathKinkNib.north, 24, 24) : "154 -462 24 24";
const pathKinkCentre = pathKinkNib ? { east: pathKinkNib.east, north: pathKinkNib.north } : null;

const out = {
  facetSpot,
  kerbReturn,
  roadGaps,
  pathKink,
  pathKinkCentre,
  kelvinBox: { east: KELVIN_EAST, svgY: KELVIN_SVG_Y },
  facet,
  kerb,
  roadGapsBest,
  pathKinkNib,
  railY,
};
writeFileSync("/opt/cursor/artifacts/kelvin-jolimont-crops.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
