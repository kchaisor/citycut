/**
 * Per-stage planPaths profile: mean of 3 runs, main vs PR (east + jolimont models).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
const models = [
  { path: "/opt/cursor/artifacts/east-model.json", name: "east" },
  { path: "/opt/cursor/artifacts/jolimont-model.json", name: "jolimont" },
];

function meanRuns(modelPath, label, runs = 3) {
  for (let i = 0; i < runs; i++) {
    execSync(`npx vite-node scripts/profile-plan-paths.mjs ${modelPath} ${label}`, {
      cwd: "/workspace",
      stdio: "pipe",
    });
  }
  const all = readFileSync("/opt/cursor/artifacts/profile-plan-paths.jsonl", "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((row) => row.label === label && row.model === modelPath);
  const slice = all.slice(-runs);
  const keys = Object.keys(slice[0] ?? {}).filter((k) => k.endsWith("Ms") || k === "totalMs");
  const mean = { label, model: modelPath };
  for (const key of keys) {
    mean[key] = Math.round(slice.reduce((s, r) => s + (r[key] ?? 0), 0) / slice.length);
  }
  return mean;
}

function checkoutMainPlanLibs() {
  execSync("git checkout main -- src/lib/svgPlan.ts src/lib/roadFill.ts src/lib/polygonOffset.ts", {
    cwd: "/workspace",
  });
}

function restoreBranch() {
  execSync(
    `git checkout ${branch} -- src/lib/svgPlan.ts src/lib/roadFill.ts src/lib/polygonOffset.ts src/lib/roadSurfacePlan.ts src/lib/centrelineUnionPrep.ts`,
    { cwd: "/workspace" },
  );
}

mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync("/opt/cursor/artifacts/profile-plan-paths.jsonl", "");

const report = {};
for (const { path, name } of models) {
  checkoutMainPlanLibs();
  report[name] = { main: meanRuns(path, `${name}-main`) };
  restoreBranch();
  report[name].pr = meanRuns(path, `${name}-pr`);
}

writeFileSync("/opt/cursor/artifacts/profile-main-pr-compare.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
