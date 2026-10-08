import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { planPaths } from "../src/lib/svgPlan.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const model = JSON.parse(readFileSync("/opt/cursor/artifacts/east-model.json", "utf8"));

function mean(smooth) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    clearFootpathUnionCacheForTests();
    const t0 = performance.now();
    const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, smoothOutput: smooth });
    runs.push({ total: Math.round(performance.now() - t0), ringSmoothMs: plan.ringSmoothMs });
  }
  return { mean: Math.round(runs.reduce((s, r) => s + r.total, 0) / 3), runs };
}

console.log(JSON.stringify({ noSmooth: mean(false), withSmooth: mean(true) }, null, 2));
