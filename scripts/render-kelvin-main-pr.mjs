/**
 * Kelvin QA: full planPaths renders for main vs PR at identical viewBoxes.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const model = process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json";

if (!existsSync(model)) {
  throw new Error(`missing model ${model}`);
}

if (!existsSync("/opt/cursor/artifacts/kelvin-jolimont-crops.json")) {
  execSync(`npx vite-node scripts/find-kelvin-jolimont-crops-plan.mjs ${model}`, { stdio: "inherit", cwd: "/workspace" });
}

execSync(`npx vite-node scripts/render-kelvin-plan-shots.mjs ${model} main`, { stdio: "inherit", cwd: "/workspace" });
execSync(`npx vite-node scripts/render-kelvin-plan-shots.mjs ${model} pr`, { stdio: "inherit", cwd: "/workspace" });

console.log("Kelvin main/pr shots in /opt/cursor/artifacts");
