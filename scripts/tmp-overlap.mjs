import { readFileSync } from "node:fs";
import * as polygonClipping from "polygon-clipping";
import { planPaths } from "./src/lib/svgPlan.ts";
import { clearFootpathUnionCacheForTests } from "./src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "./src/lib/lineweights.ts";
import { openRing, signedArea } from "./src/lib/geo.ts";

function multiArea(multi) {
  let t = 0;
  for (const poly of multi) {
    t += Math.abs(signedArea(openRing(poly[0])));
    for (const h of poly.slice(1)) t -= Math.abs(signedArea(openRing(h)));
  }
  return t;
}

const model = JSON.parse(readFileSync("/opt/cursor/artifacts/jolimont-model.json", "utf8"));
clearFootpathUnionCacheForTests();
const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });
const greenRoad = [];
for (const rings of plan.greenOnRoad) {
  const outer = rings[0];
  if (outer) greenRoad.push([[...outer, outer[0]]]);
}
const overlap = polygonClipping.intersection(plan.pathFill, greenRoad);
console.log("overlap", multiArea(overlap), "greenOnRoad count", plan.greenOnRoad.length, "green count", plan.green.length);
