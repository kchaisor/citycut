/**
 * Mean planPaths wall time on a 1 km East Melbourne model (3 runs, fillet 2).
 * Usage: npx vite-node scripts/bench-plan-1km.mjs [east-model.json] [label]
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { planPaths } from "../src/lib/svgPlan.ts";
import * as roadFill from "../src/lib/roadFill.ts";
const clearFootpathUnionCacheForTests =
  roadFill.clearFootpathUnionCacheForTests ?? (() => {});
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const modelPath = process.argv[2] ?? "/opt/cursor/artifacts/east-model.json";
const label = process.argv[3] ?? "unknown";
const model = JSON.parse(readFileSync(modelPath, "utf8"));
const runs = [];

for (let i = 0; i < 3; i++) {
  clearFootpathUnionCacheForTests();
  const t0 = performance.now();
  planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });
  runs.push(Math.round(performance.now() - t0));
}

const meanMs = Math.round(runs.reduce((a, b) => a + b, 0) / runs.length);
const row = { label, git: label, runs, meanMs };
const outPath = "/opt/cursor/artifacts/bench-plan-1km.jsonl";
appendFileSync(outPath, JSON.stringify(row) + "\n");
console.log(JSON.stringify(row));
