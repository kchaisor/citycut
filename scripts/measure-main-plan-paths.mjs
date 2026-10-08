import { readFileSync } from "node:fs";
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
const files = [
  "src/lib/roadFill.ts",
  "src/lib/polygonOffset.ts",
  "src/lib/roadSurfacePlan.ts",
  "src/lib/centrelineUnionPrep.ts",
  "src/lib/svgPlan.ts",
];
execSync(`git checkout main -- ${files.join(" ")}`, { cwd: "/workspace" });
execSync("rm -f src/lib/centrelineUnionPrep.ts src/lib/roadSurfacePlan.ts 2>/dev/null; git checkout main -- src/lib/roadSurfacePlan.ts 2>/dev/null || true", {
  cwd: "/workspace",
  shell: "/bin/bash",
});

const east = JSON.parse(readFileSync("./src/lib/fixtures/east-melbourne-path-trim.json", "utf8"));
clearFootpathUnionCacheForTests();
const mainPlan = planPaths(east, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });
console.log("main full planPaths east area", Math.round(multiArea(mainPlan.pathFill)));

execSync(`git checkout ${branch} -- ${files.join(" ")}`, { cwd: "/workspace" });
clearFootpathUnionCacheForTests();
const prPlan = planPaths(east, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });
console.log("PR east area", Math.round(multiArea(prPlan.pathFill)));
