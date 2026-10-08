import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { planPaths } from "../src/lib/svgPlan.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
const model = JSON.parse(readFileSync("/opt/cursor/artifacts/east-model.json", "utf8"));
const vb = process.argv[2] ?? "-210 339 28 28";
const [vx, vy, vw, vh] = vb.split(" ").map(Number);
const mainLibFiles = ["src/lib/polygonOffset.ts", "src/lib/roadFill.ts"];

function inView(p) {
  return p[0] >= vx && p[0] <= vx + vw && p[1] >= vy && p[1] <= vy + vh;
}

function countInView(plan) {
  let n = 0;
  for (const poly of plan.pathFill) {
    for (const ring of poly) {
      for (const p of ring) {
        if (inView(p)) n++;
      }
    }
  }
  return n;
}

function runPlan() {
  clearFootpathUnionCacheForTests();
  return planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2 });
}

execSync(`git checkout main -- ${mainLibFiles.join(" ")}`, { cwd: "/workspace" });
rmSync("/workspace/src/lib/centrelineSmooth.ts", { force: true });
const mainPlan = runPlan();
execSync(`git checkout ${branch} -- ${mainLibFiles.join(" ")} src/lib/centrelineSmooth.ts`, { cwd: "/workspace" });
const prPlan = runPlan();

console.log(JSON.stringify({ vb, mainPts: countInView(mainPlan), prPts: countInView(prPlan) }));
