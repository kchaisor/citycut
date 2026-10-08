import { readFileSync } from "node:fs";
import { planPaths } from "../src/lib/svgPlan.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";
import { openRing, signedArea } from "../src/lib/geo.ts";

function ma(m) {
  let t = 0;
  for (const p of m) {
    const o = p[0];
    if (o) t += Math.abs(signedArea(openRing(o)));
    for (const h of p.slice(1)) t -= Math.abs(signedArea(openRing(h)));
  }
  return t;
}

const east = JSON.parse(readFileSync("./src/lib/fixtures/east-melbourne-path-trim.json", "utf8"));
for (const smooth of [false, true]) {
  clearFootpathUnionCacheForTests();
  const plan = planPaths(east, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, smoothOutput: smooth });
  console.log("smooth", smooth, Math.round(ma(plan.pathFill)));
}
