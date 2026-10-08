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

const out = {
  facetSpot: bestT ? `${Math.round(bestT.c[0] - 28)} ${Math.round(bestT.c[1] - 28)} 55 55` : "120 180 55 55",
  kerbReturn: bestT ? `${Math.round(bestT.c[0] - 6)} ${Math.round(bestT.c[1] - 6)} 12 12` : "145 195 12 12",
  roadGaps: bestT ? `${Math.round(bestT.c[0] - 22)} ${Math.round(bestT.c[1] - 20)} 45 40` : "130 175 45 40",
  railY,
  crossings: crossings.length,
};
writeFileSync("/opt/cursor/artifacts/kelvin-jolimont-crops.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
const modelArg = process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json";
execSync(`npx vite-node scripts/find-path-kink-crop.mjs ${modelArg}`, { cwd: "/workspace", stdio: "inherit" });
console.log(readFileSync("/opt/cursor/artifacts/kelvin-jolimont-crops.json", "utf8"));
