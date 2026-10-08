import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { footpathLines } from "../src/lib/roadFill.ts";

const model = JSON.parse(readFileSync(process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json", "utf8"));
const paths = footpathLines(model.roads);

function segIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}

const crossings = [];
for (let i = 0; i < paths.length; i++) {
  for (let j = i + 1; j < paths.length; j++) {
    const a = paths[i];
    const b = paths[j];
    for (let ai = 0; ai < a.length - 1; ai++) {
      for (let bi = 0; bi < b.length - 1; bi++) {
        if (segIntersect(a[ai], a[ai + 1], b[bi], b[bi + 1])) {
          crossings.push([
            (a[ai][0] + a[ai + 1][0] + b[bi][0] + b[bi + 1][0]) / 4,
            (a[ai][1] + a[ai + 1][1] + b[bi][1] + b[bi + 1][1]) / 4,
          ]);
        }
      }
    }
  }
}

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

let bestT = null;
for (const c of crossings) {
  const score = Math.abs(c[1] - railY);
  if (!bestT || score < bestT.score) bestT = { c, score };
}

/** viewBox Y matches svg path coordinates (y = −north). */
function vbAround(east, north, w, h, padX, padY) {
  const svgY = -north;
  return `${Math.round(east - padX)} ${Math.round(svgY - padY)} ${w} ${h}`;
}

const out = {
  facetSpot: bestT ? vbAround(bestT.c[0], bestT.c[1], 55, 55, 28, 28) : "-55 120 55 55",
  kerbReturn: bestT ? vbAround(bestT.c[0], bestT.c[1], 12, 12, 6, 6) : "-33 142 12 12",
  roadGaps: bestT ? vbAround(bestT.c[0], bestT.c[1], 45, 40, 22, 20) : "-49 128 45 40",
  pathKink: "-25 138 22 22",
  railY,
  crossings: crossings.length,
};

writeFileSync("/opt/cursor/artifacts/kelvin-jolimont-crops.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));

const modelArg = process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json";
execSync(`npx vite-node scripts/find-road-gaps-crop.mjs ${modelArg}`, { cwd: "/workspace", stdio: "inherit" });
console.log(readFileSync("/opt/cursor/artifacts/kelvin-jolimont-crops.json", "utf8"));
