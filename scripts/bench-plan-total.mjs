import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { planPaths } from "../src/lib/svgPlan.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const model = JSON.parse(readFileSync(process.argv[2] ?? "/opt/cursor/artifacts/east-model.json", "utf8"));
const mode = process.argv[3] ?? "pr";
const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();

if (mode === "main") {
  execSync("git checkout main -- src/lib/svgPlan.ts src/lib/roadFill.ts src/lib/polygonOffset.ts", { cwd: "/workspace" });
} else {
  execSync(`git checkout ${branch} -- src/lib/svgPlan.ts src/lib/roadFill.ts src/lib/polygonOffset.ts src/lib/roadSurfacePlan.ts`, {
    cwd: "/workspace",
  });
}

const runs = [];
for (let i = 0; i < 3; i++) {
  clearFootpathUnionCacheForTests();
  const t0 = performance.now();
  const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
    pathFilletM: 2,
    smoothOutput: mode !== "main",
  });
  runs.push({ total: Math.round(performance.now() - t0), ringSmoothMs: plan.ringSmoothMs ?? 0 });
}

execSync(`git checkout ${branch} -- src/lib/svgPlan.ts src/lib/roadFill.ts src/lib/polygonOffset.ts src/lib/roadSurfacePlan.ts`, {
  cwd: "/workspace",
});

const mean = Math.round(runs.reduce((s, r) => s + r.total, 0) / runs.length);
console.log(JSON.stringify({ mode, runs, meanTotalMs: mean }, null, 2));
