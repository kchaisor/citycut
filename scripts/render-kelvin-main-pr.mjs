/**
 * Kelvin QA: main from origin/main worktree, PR from this branch; fail if any pair matches.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const model = process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const branchRoot = join(scriptDir, "..");
const worktreeRoot = process.env.CITYCUT_MAIN_WORKTREE ?? "/opt/cursor/citycut-main-worktree";

function md5(path) {
  return createHash("md5").update(readFileSync(path)).digest("hex");
}

function syncRenderScripts() {
  const scripts = ["render-kelvin-plan-shots.mjs", "profile-plan-paths.mjs"];
  mkdirSync(join(worktreeRoot, "scripts"), { recursive: true });
  for (const name of scripts) {
    copyFileSync(join(branchRoot, "scripts", name), join(worktreeRoot, "scripts", name));
  }
}

function ensureMainWorktree() {
  if (!existsSync(join(worktreeRoot, "package.json"))) {
    execSync(`git worktree add ${worktreeRoot} origin/main`, { cwd: branchRoot, stdio: "inherit" });
    execSync("npm ci", { cwd: worktreeRoot, stdio: "inherit" });
  }
  syncRenderScripts();
}

if (!existsSync(model)) {
  throw new Error(`missing model ${model}`);
}

if (!existsSync("/opt/cursor/artifacts/kelvin-jolimont-crops.json")) {
  execSync(`npx vite-node scripts/find-kelvin-jolimont-crops-plan.mjs ${model}`, { stdio: "inherit", cwd: branchRoot });
}

ensureMainWorktree();

const envMain = { ...process.env, CITYCUT_ROOT: worktreeRoot };
const envPr = { ...process.env, CITYCUT_ROOT: branchRoot };

execSync(`npx vite-node scripts/render-kelvin-plan-shots.mjs ${model} main`, {
  stdio: "inherit",
  cwd: worktreeRoot,
  env: envMain,
});
execSync(`npx vite-node scripts/render-kelvin-plan-shots.mjs ${model} pr`, {
  stdio: "inherit",
  cwd: branchRoot,
  env: envPr,
});

const shots = ["facet-spot", "kerb-return", "road-gaps", "path-kink"];
const identical = [];
for (const name of shots) {
  const mainPath = `/opt/cursor/artifacts/${name}-main.png`;
  const prPath = `/opt/cursor/artifacts/${name}-pr.png`;
  const mainHash = md5(mainPath);
  const prHash = md5(prPath);
  console.log(name, "main", mainHash, "pr", prHash);
  if (mainHash === prHash) identical.push(name);
}

if (identical.length > 0) {
  throw new Error(`main and PR PNGs are byte-identical for: ${identical.join(", ")}`);
}

console.log("Kelvin main/pr shots OK in /opt/cursor/artifacts");
