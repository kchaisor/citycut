import { readFileSync, writeFileSync } from "node:fs";
import { footpathStrips, isVehicularRoad } from "../src/lib/roadFill.ts";

const modelPath = process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json";
const model = JSON.parse(readFileSync(modelPath, "utf8"));
const strips = footpathStrips(model.roads, 2);
const snap = 0.15;

function near(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= snap;
}

const eps = [];
for (let si = 0; si < strips.length; si++) {
  const L = strips[si].line;
  if (L.length < 2) continue;
  eps.push({ si, end: "start", pt: L[0] });
  eps.push({ si, end: "end", pt: L[L.length - 1] });
}

const groups = [];
for (const ep of eps) {
  let g = groups.find((gg) => gg.some((e) => near(e.pt, ep.pt)));
  if (g) g.push(ep);
  else groups.push([ep]);
}

function junctionPt(group) {
  let x = 0;
  let y = 0;
  for (const e of group) {
    x += e.pt[0];
    y += e.pt[1];
  }
  return [x / group.length, y / group.length];
}

function bendAt(strip, junction) {
  const line = strip.line;
  let best = 0;
  for (let i = 1; i < line.length - 1; i++) {
    if (!near(line[i], junction)) continue;
    const ax = line[i - 1][0];
    const ay = line[i - 1][1];
    const bx = line[i + 1][0];
    const by = line[i + 1][1];
    const jx = line[i][0];
    const jy = line[i][1];
    const v1 = [ax - jx, ay - jy];
    const v2 = [bx - jx, by - jy];
    const d1 = Math.hypot(v1[0], v1[1]);
    const d2 = Math.hypot(v2[0], v2[1]);
    if (d1 < 0.05 || d2 < 0.05) continue;
    let c = (v1[0] * v2[0] + v1[1] * v2[1]) / (d1 * d2);
    c = Math.max(-1, Math.min(1, c));
    best = Math.max(best, Math.acos(c));
  }
  return best;
}

function outwardDir(strip, end, junction) {
  const line = strip.line;
  if (line.length < 2) return null;
  if (end === "end") {
    const prev = line[line.length - 2];
    return Math.atan2(junction[1] - prev[1], junction[0] - prev[0]);
  }
  const next = line[1];
  return Math.atan2(next[1] - junction[1], next[0] - junction[0]);
}

function throughBendAtJunction(group, p) {
  let minStraight = Infinity;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      const e0 = group[i];
      const e1 = group[j];
      if (e0.si === e1.si) continue;
      const d0 = outwardDir(strips[e0.si], e0.end, p);
      const d1 = outwardDir(strips[e1.si], e1.end, p);
      if (d0 === null || d1 === null) continue;
      let delta = d1 - d0;
      const tau = Math.PI * 2;
      delta = ((delta % tau) + tau) % tau;
      if (delta > Math.PI) delta = tau - delta;
      const straight = Math.abs(delta - Math.PI);
      minStraight = Math.min(minStraight, straight);
    }
  }
  let interior = 0;
  for (const si of [...new Set(group.map((e) => e.si))]) {
    interior = Math.max(interior, bendAt(strips[si], p));
  }
  if (!Number.isFinite(minStraight)) return interior;
  return Math.max(minStraight, interior);
}

const tJunctions = [];
for (const group of groups) {
  if (group.length !== 3) continue;
  const p = junctionPt(group);
  const stripIds = [...new Set(group.map((e) => e.si))];
  if (stripIds.length < 2) continue;
  const bend = throughBendAtJunction(group, p);
  tJunctions.push({ p, bend, stripIds: stripIds.length });
}

const rails = model.roads.filter((r) => r.kind === "rail");
let railY = 0;
let railN = 0;
for (const r of rails) {
  for (const pt of r.line) {
    railY += pt[1];
    railN++;
  }
}
railY /= Math.max(1, railN);

const roads = model.roads.filter(isVehicularRoad);
const roadSegs = [];
for (const road of roads) {
  for (let i = 0; i < road.line.length - 1; i++) {
    roadSegs.push([
      (road.line[i][0] + road.line[i + 1][0]) / 2,
      (road.line[i][1] + road.line[i + 1][1]) / 2,
    ]);
  }
}

function nearRoad(p, maxD = 35) {
  for (const [x, y] of roadSegs) {
    if (Math.hypot(p[0] - x, p[1] - y) < maxD) return true;
  }
  return false;
}

tJunctions.sort((a, b) => {
  const score = (t) => {
    const idealBend = t.bend > 0.04 && t.bend < 0.32;
    const bendScore = idealBend ? Math.abs(t.bend - 0.12) * 5 : 20 + t.bend;
    const railScore = Math.abs(t.p[1] - railY);
    const roadScore = nearRoad(t.p) ? 0 : 50;
    const westScore = t.p[0] < 80 ? 0 : Math.min(30, (t.p[0] - 80) * 0.15);
    return bendScore + railScore * 0.35 + roadScore + westScore;
  };
  return score(a) - score(b);
});

if (process.env.DEBUG_TJ) {
  console.log(
    tJunctions
      .filter((t) => t.bend > 0.03 && t.bend < 0.35)
      .slice(0, 12)
      .map((t) => ({ p: t.p.map((v) => +v.toFixed(1)), bend: +t.bend.toFixed(3) })),
  );
}

const best = tJunctions[0];
const pathKink = best
  ? `${Math.round(best.p[0] - 9)} ${Math.round(best.p[1] - 9)} 18 18`
  : "-36 -140 18 18";

console.log(JSON.stringify({ best, pathKink, railY, count: tJunctions.length }, null, 2));

const cropFile = "/opt/cursor/artifacts/kelvin-jolimont-crops.json";
let crops = {};
try {
  crops = JSON.parse(readFileSync(cropFile, "utf8"));
} catch {
  /* empty */
}
crops.pathKink = pathKink;
writeFileSync(cropFile, JSON.stringify(crops, null, 2));
