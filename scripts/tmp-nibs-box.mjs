import { readFileSync } from "node:fs";
import { planPaths } from "../src/lib/svgPlan.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";
import { findPathJunctionNibs } from "../src/lib/pathJunctionNib.ts";

const model = JSON.parse(readFileSync("/opt/cursor/artifacts/jolimont-model.json", "utf8"));
clearFootpathUnionCacheForTests();
const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, smoothOutput: false });
const all = findPathJunctionNibs(plan.pathFill, 200);
for (const n of all) {
  if (n.east >= 60 && n.east <= 240 && n.north >= 350 && n.north <= 500) {
    console.log(n);
  }
}
console.log("count in clarendon-ish", all.filter((n) => n.east >= 60 && n.east <= 240 && n.north >= 350 && n.north <= 500).length);
