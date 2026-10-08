import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { planPaths } from "../src/lib/svgPlan.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";
import { openRing, signedArea } from "../src/lib/geo.ts";

function multiArea(multi) {
  let t = 0;
  for (const p of multi) {
    const o = p[0];
    if (o) t += Math.abs(signedArea(openRing(o)));
    for (const h of p.slice(1)) t -= Math.abs(signedArea(openRing(h)));
  }
  return t;
}

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
execSync("git checkout main -- src/lib/roadFill.ts src/lib/polygonOffset.ts", { cwd: "/workspace" });
const east = JSON.parse(readFileSync("./src/lib/fixtures/east-melbourne-path-trim.json", "utf8"));
clearFootpathUnionCacheForTests();
const plan = planPaths(east, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });
console.log("main roadFill path area", Math.round(multiArea(plan.pathFill)));
execSync(`git checkout ${branch} -- src/lib/roadFill.ts src/lib/polygonOffset.ts`, { cwd: "/workspace" });
clearFootpathUnionCacheForTests();
const pr = planPaths(east, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });
console.log("PR path area", Math.round(multiArea(pr.pathFill)));
