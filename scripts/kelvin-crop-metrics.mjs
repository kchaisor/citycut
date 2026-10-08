import { readFileSync } from "node:fs";
import {
  KELVIN_CROPS,
  curveVertexCount,
  maxHausdorffOutsideSmoothed,
  maxTurnOnCurves,
} from "../src/lib/planSmoothMetrics.ts";
import { clearFootpathUnionCacheForTests, setCentrelineSmoothForUnion } from "../src/lib/roadFill.ts";
import { planPaths } from "../src/lib/svgPlan.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";
import { signedArea, openRing } from "../src/lib/geo.ts";

const model = JSON.parse(readFileSync("/opt/cursor/artifacts/jolimont-model.json", "utf8"));

function multiArea(multi) {
  let t = 0;
  for (const p of multi) {
    const o = p[0];
    if (!o) continue;
    t += Math.abs(signedArea(openRing(o)));
    for (const h of p.slice(1)) t -= Math.abs(signedArea(openRing(h)));
  }
  return t;
}

function plan(opts) {
  clearFootpathUnionCacheForTests();
  setCentrelineSmoothForUnion(opts.centrelineSmooth !== false);
  return planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, ...opts });
}

const main = plan({ smoothOutput: false, centrelineSmooth: false });
const pr = plan({ smoothOutput: true, centrelineSmooth: true });

console.log("areas", {
  pathPct: ((multiArea(pr.pathFill) - multiArea(main.pathFill)) / multiArea(main.pathFill)) * 100,
  roadPct: ((multiArea(pr.roadFill) - multiArea(main.roadFill)) / multiArea(main.roadFill)) * 100,
});

for (const [name, vb] of Object.entries(KELVIN_CROPS)) {
  const hPath = maxHausdorffOutsideSmoothed(main.pathFill, pr.pathFill, vb, "path", [main.roadFill, pr.roadFill]);
  const hRoad = maxHausdorffOutsideSmoothed(main.roadFill, pr.roadFill, vb, "road");
  const hausdorffM = name === "path-kink" ? Math.max(hPath, hRoad) : hPath;
  console.log(name, {
    hausdorffM: +hausdorffM.toFixed(4),
    hausdorffPathM: +hPath.toFixed(4),
    hausdorffRoadM: +hRoad.toFixed(4),
    maxTurnMain: +Math.max(maxTurnOnCurves(main.pathFill, vb), maxTurnOnCurves(main.roadFill, vb)).toFixed(3),
    maxTurnPr: +Math.max(maxTurnOnCurves(pr.pathFill, vb), maxTurnOnCurves(pr.roadFill, vb)).toFixed(3),
    curveVertsMain: curveVertexCount(main.pathFill, vb) + curveVertexCount(main.roadFill, vb),
    curveVertsPr: curveVertexCount(pr.pathFill, vb) + curveVertexCount(pr.roadFill, vb),
  });
}
