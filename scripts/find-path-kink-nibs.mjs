/**
 * Top-10 T-junction nib candidates on faceted (main-style) footpath fill.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { planPaths } from "../src/lib/svgPlan.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";
import { findPathJunctionNibs, viewBoxAround } from "../src/lib/pathJunctionNib.ts";

const modelPath = process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json";
const model = JSON.parse(readFileSync(modelPath, "utf8"));

clearFootpathUnionCacheForTests();
const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, smoothOutput: false });

function kelvinScore(nib) {
  let score = nib.score;
  const svgY = -nib.north;
  if (nib.east >= 80 && nib.east <= 220 && svgY >= -490 && svgY <= -380) score += 45;
  let eastCount = 0;
  let northCount = 0;
  let southCount = 0;
  for (const poly of plan.pathFill) {
    for (const p of poly[0]?.slice(0, -1) ?? []) {
      if (p[0] > nib.east + 4 && Math.abs(p[1] - nib.north) < 22) eastCount++;
      if (p[1] > nib.north + 4 && Math.abs(p[0] - nib.east) < 18) northCount++;
      if (p[1] < nib.north - 4 && Math.abs(p[0] - nib.east) < 18) southCount++;
    }
  }
  if (eastCount >= 6 && northCount >= 4 && southCount >= 4) score += 40;
  if (nib.east < 190) score += 8;
  return score;
}

const pool = findPathJunctionNibs(plan.pathFill, 200);
const ranked = pool
  .map((n) => ({ ...n, kelvinScore: kelvinScore(n), viewBox: viewBoxAround(n.east, n.north, 24, 24) }))
  .sort((a, b) => b.kelvinScore - a.kelvinScore);
const top10 = ranked.slice(0, 10);

const best = ranked[0];
const out = {
  candidates: top10,
  pathKink: best?.viewBox ?? "-25 138 24 24",
  pathKinkCentre: best ? { east: best.east, north: best.north } : null,
};

const cropFile = "/opt/cursor/artifacts/kelvin-jolimont-crops.json";
let crops = {};
try {
  crops = JSON.parse(readFileSync(cropFile, "utf8"));
} catch {
  /* new file */
}
writeFileSync(
  cropFile,
  JSON.stringify({ ...crops, pathKink: out.pathKink, pathKinkCentre: out.pathKinkCentre, nibCandidates: out.candidates }, null, 2),
);
console.log(JSON.stringify(out, null, 2));
