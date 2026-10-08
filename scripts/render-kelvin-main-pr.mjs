/**
 * Kelvin QA: full planPaths renders for main vs PR at identical viewBoxes.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const model = process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json";
const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
const mainLib = ["src/lib/polygonOffset.ts", "src/lib/roadFill.ts"];
const prOnly = ["src/lib/roadSurfacePlan.ts", "src/lib/centrelineUnionPrep.ts"];

function checkoutMain() {
  execSync(`git checkout main -- ${mainLib.join(" ")}`, { cwd: "/workspace" });
  for (const f of prOnly) {
    execSync(`rm -f /workspace/${f}`, { cwd: "/workspace" });
  }
  execSync("git checkout main -- src/lib/svgPlan.ts src/lib/aiPlan.ts src/components/DrawingPlan.tsx 2>/dev/null || true", {
    cwd: "/workspace",
  });
}

function restore() {
  execSync(`git checkout ${branch} -- .`, { cwd: "/workspace" });
}

if (!existsSync(model)) {
  throw new Error(`missing model ${model}`);
}

if (!existsSync("/opt/cursor/artifacts/kelvin-jolimont-crops.json")) {
  execSync(`npx vite-node scripts/find-kelvin-jolimont-crops.mjs ${model}`, { stdio: "inherit", cwd: "/workspace" });
}

checkoutMain();
execSync(`npx vite-node scripts/render-kelvin-plan-shots.mjs ${model} main`, { stdio: "inherit", cwd: "/workspace" });
restore();
execSync(`npx vite-node scripts/render-kelvin-plan-shots.mjs ${model} pr`, { stdio: "inherit", cwd: "/workspace" });

console.log("Kelvin main/pr shots in /opt/cursor/artifacts");
