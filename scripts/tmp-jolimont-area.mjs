import { readFileSync } from "node:fs";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { planPaths } from "../src/lib/svgPlan.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";
import { signedArea, openRing } from "../src/lib/geo.ts";

const model = JSON.parse(readFileSync("/opt/cursor/artifacts/jolimont-model.json", "utf8"));
function area(multi) {
  let t = 0;
  for (const p of multi) {
    const o = p[0];
    if (!o) continue;
    t += Math.abs(signedArea(openRing(o)));
    for (const h of p.slice(1)) t -= Math.abs(signedArea(openRing(h)));
  }
  return t;
}
function run(opts) {
  clearFootpathUnionCacheForTests();
  const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, ...opts });
  return { path: area(plan.pathFill), road: area(plan.roadFill) };
}
const main = run({ smoothOutput: false, centrelineSmooth: false });
const pr = run({ smoothOutput: true, centrelineSmooth: true });
console.log(JSON.stringify({ main, pr, pathPct: (pr.path - main.path) / main.path, roadPct: (pr.road - main.road) / main.road }, null, 2));
