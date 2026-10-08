import { readFileSync, writeFileSync } from "node:fs";
import { KELVIN_CROPS, curveVertexCount, roadCurveVertexCount } from "../src/lib/planSmoothMetrics.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { planPaths } from "../src/lib/svgPlan.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const model = JSON.parse(readFileSync("/opt/cursor/artifacts/jolimont-model.json", "utf8"));
clearFootpathUnionCacheForTests();
const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, smoothOutput: true, centrelineSmooth: false });
const out = {};
for (const [n, vb] of Object.entries(KELVIN_CROPS)) {
  out[n] = {
    curveVerts: curveVertexCount(plan.pathFill, vb) + curveVertexCount(plan.roadFill, vb),
    roadCurveVerts: roadCurveVertexCount(plan.roadFill, vb),
  };
}
writeFileSync("/opt/cursor/artifacts/crop-verts-pr.json", `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
