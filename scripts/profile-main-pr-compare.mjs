/**
 * Per-stage planPaths profile: mean of 3 runs. Main = origin/main worktree; PR = branch.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const branchRoot = join(scriptDir, "..");
const worktreeRoot = process.env.CITYCUT_MAIN_WORKTREE ?? "/opt/cursor/citycut-main-worktree";

const models = [
  { path: "/opt/cursor/artifacts/east-model.json", name: "east" },
  { path: "/opt/cursor/artifacts/jolimont-model.json", name: "jolimont" },
];

function ensureMainWorktree() {
  if (!existsSync(join(worktreeRoot, "package.json"))) {
    execSync(`git worktree add ${worktreeRoot} origin/main`, { cwd: branchRoot, stdio: "inherit" });
    execSync("npm ci", { cwd: worktreeRoot, stdio: "inherit" });
  }
  mkdirSync(join(worktreeRoot, "scripts"), { recursive: true });
  copyFileSync(join(branchRoot, "scripts/profile-plan-paths.mjs"), join(worktreeRoot, "scripts/profile-plan-paths.mjs"));
}

function meanRuns(modelPath, label, envExtra, runs = 3) {
  for (let i = 0; i < runs; i++) {
    const cwd = envExtra.CITYCUT_ROOT === worktreeRoot ? worktreeRoot : branchRoot;
    execSync(`npx vite-node scripts/profile-plan-paths.mjs ${modelPath} ${label}`, {
      cwd,
      stdio: "pipe",
      env: { ...process.env, ...envExtra },
    });
  }
  const all = readFileSync("/opt/cursor/artifacts/profile-plan-paths.jsonl", "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((row) => row.label === label && row.model === modelPath);
  const slice = all.slice(-runs);
  const keys = Object.keys(slice[0] ?? {}).filter((k) => k.endsWith("Ms") || k === "totalMs");
  const mean = { label, model: modelPath, tree: envExtra.CITYCUT_ROOT ?? branchRoot };
  for (const key of keys) {
    mean[key] = Math.round(slice.reduce((s, r) => s + (r[key] ?? 0), 0) / slice.length);
  }
  return mean;
}

ensureMainWorktree();

mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync("/opt/cursor/artifacts/profile-plan-paths.jsonl", "");

const report = { branchRoot, mainWorktree: worktreeRoot };
for (const { path, name } of models) {
  report[name] = {
    main: meanRuns(path, `${name}-main`, { CITYCUT_ROOT: worktreeRoot }),
    pr: meanRuns(path, `${name}-pr`, { CITYCUT_ROOT: branchRoot }),
  };
}

writeFileSync("/opt/cursor/artifacts/profile-main-pr-compare.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
