/**
 * Top-10 T-junction nib candidates on faceted footpath fill (Kelvin pocket preferred).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { planPaths } from "../src/lib/svgPlan.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";
import { findPathJunctionNibs, viewBoxAround } from "../src/lib/pathJunctionNib.ts";

const modelPath = process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json";
const model = JSON.parse(readFileSync(modelPath, "utf8"));

const KELVIN_EAST = [80, 220];
const KELVIN_NORTH = [-455, -385];

function inKelvinBox(east, north) {
  return east >= KELVIN_EAST[0] && east <= KELVIN_EAST[1] && north >= KELVIN_NORTH[0] && north <= KELVIN_NORTH[1];
}

clearFootpathUnionCacheForTests();
const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, smoothOutput: false });

function kelvinScore(nib) {
  let score = nib.score;
  if (inKelvinBox(nib.east, nib.north)) score += 50;
  let eastCount = 0;
  let northCount = 0;
  let southCount = 0;
  let westCount = 0;
  for (const poly of plan.pathFill) {
    for (const p of poly[0]?.slice(0, -1) ?? []) {
      if (p[0] > nib.east + 4 && Math.abs(p[1] - nib.north) < 22) eastCount++;
      if (p[0] < nib.east - 4 && Math.abs(p[1] - nib.north) < 22) westCount++;
      if (p[1] > nib.north + 4 && Math.abs(p[0] - nib.east) < 18) northCount++;
      if (p[1] < nib.north - 4 && Math.abs(p[0] - nib.east) < 18) southCount++;
    }
  }
  const arms = [eastCount, westCount, northCount, southCount].filter((c) => c >= 4).length;
  if (arms >= 4) score -= 80;
  else if (arms === 3) score -= 40;
  if (southCount >= 4 && eastCount >= 4 && northCount < 4) score += 25;
  if (westCount >= 4 && southCount >= 4 && eastCount < 4) score += 30;
  return score;
}

const pool = findPathJunctionNibs(plan.pathFill, 200);
const inBox = pool.filter((n) => inKelvinBox(n.east, n.north));
const ranked = (inBox.length > 0 ? inBox : pool)
  .map((n) => ({ ...n, kelvinScore: kelvinScore(n), viewBox: viewBoxAround(n.east, n.north, 24, 24) }))
  .sort((a, b) => b.kelvinScore - a.kelvinScore);
const top10 = ranked.slice(0, 10);

const best = ranked[0];
const out = {
  candidates: top10,
  pathKink: best?.viewBox ?? "125 420 24 24",
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
