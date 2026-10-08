import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { KELVIN_CROPS, curveVertexCount, roadCurveVertexCount } from "../src/lib/planSmoothMetrics.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { planPaths } from "../src/lib/svgPlan.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const modelPath = "/opt/cursor/artifacts/jolimont-model.json";
const worktree = process.env.CITYCUT_MAIN_WORKTREE ?? "/opt/cursor/citycut-main-worktree";

function planAt(root) {
  const code = `
    import { clearFootpathUnionCacheForTests } from "${root}/src/lib/roadFill.ts";
    import { planPaths } from "${root}/src/lib/svgPlan.ts";
    import { PATH_WIDTH_M } from "${root}/src/lib/lineweights.ts";
    clearFootpathUnionCacheForTests();
    const model = JSON.parse(await import("node:fs").then(m=>m.readFileSync("${modelPath}","utf8")));
    const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, smoothOutput: false, centrelineSmooth: false });
    console.log(JSON.stringify({ pathFill: plan.pathFill, roadFill: plan.roadFill }));
  `;
  const out = execSync(`npx vite-node --eval ${JSON.stringify(code)}`, { cwd: root, encoding: "utf8" });
  return JSON.parse(out.trim());
}

const mainPlan = planAt(worktree);
clearFootpathUnionCacheForTests();
const prPlan = planPaths(JSON.parse(readFileSync(modelPath, "utf8")), PATH_WIDTH_M, 5, 500, 5, 2500, {
  pathFilletM: 2,
  smoothOutput: true,
  centrelineSmooth: false,
});

const report = {};
for (const [name, vb] of Object.entries(KELVIN_CROPS)) {
  report[name] = {
    curveVertsMain: curveVertexCount(mainPlan.pathFill, vb) + curveVertexCount(mainPlan.roadFill, vb),
    curveVertsPr: curveVertexCount(prPlan.pathFill, vb) + curveVertexCount(prPlan.roadFill, vb),
    roadCurveVertsMain: roadCurveVertexCount(mainPlan.roadFill, vb),
    roadCurveVertsPr: roadCurveVertexCount(prPlan.roadFill, vb),
  };
}

console.log(JSON.stringify(report, null, 2));
writeFileSync("/opt/cursor/artifacts/crop-verts-main-pr.json", `${JSON.stringify(report, null, 2)}\n`);
