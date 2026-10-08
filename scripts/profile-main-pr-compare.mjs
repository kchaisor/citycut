/**
 * Full planPaths profile: 2 warmup + mean of 5 runs. Main = origin/main worktree; PR = branch.
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
  } else {
    execSync("git fetch origin main", { cwd: worktreeRoot, stdio: "pipe" });
    execSync("git checkout main && git reset --hard origin/main", { cwd: worktreeRoot, stdio: "pipe" });
    execSync("npm ci", { cwd: worktreeRoot, stdio: "inherit" });
  }
  mkdirSync(join(worktreeRoot, "scripts"), { recursive: true });
  copyFileSync(join(branchRoot, "scripts/profile-plan-paths.mjs"), join(worktreeRoot, "scripts/profile-plan-paths.mjs"));
}

function meanRuns(modelPath, label, envExtra, { warmup = 2, runs = 5 } = {}) {
  const cwd = envExtra.CITYCUT_ROOT === worktreeRoot ? worktreeRoot : branchRoot;
  for (let i = 0; i < warmup; i++) {
    execSync(`npx vite-node scripts/profile-plan-paths.mjs ${modelPath} ${label}-warm`, {
      cwd,
      stdio: "pipe",
      env: { ...process.env, ...envExtra },
    });
  }
  for (let i = 0; i < runs; i++) {
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
  const mean = { label, model: modelPath, tree: envExtra.CITYCUT_ROOT ?? branchRoot, warmupRuns: warmup, timedRuns: runs };
  for (const key of keys) {
    mean[key] = Math.round(slice.reduce((s, r) => s + (r[key] ?? 0), 0) / slice.length);
  }
  mean.totalMsExGreen = mean.totalMs - (mean.greenSplitMs ?? 0);
  return mean;
}

ensureMainWorktree();

mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync("/opt/cursor/artifacts/profile-plan-paths.jsonl", "");

const report = {
  branchRoot,
  mainWorktree: worktreeRoot,
  methodology: "2 warmup + mean of 5 timed runs; full planPaths totalMs (not core-only)",
  budgets: { eastTotalMsExGreenMax: 1125, jolimontTotalMsExGreenMax: 1290 },
};
for (const { path, name } of models) {
  report[name] = {
    main: meanRuns(path, `${name}-main`, { CITYCUT_ROOT: worktreeRoot }),
    pr: meanRuns(path, `${name}-pr`, { CITYCUT_ROOT: branchRoot }),
  };
  const m = report[name].main;
  const p = report[name].pr;
  report[name].delta = {
    totalMs: p.totalMs - m.totalMs,
    totalMsPctVsMain: m.totalMs > 0 ? Math.round((1000 * (p.totalMs - m.totalMs)) / m.totalMs) / 10 : null,
    totalMsExGreen: p.totalMsExGreen - m.totalMsExGreen,
    totalMsExGreenPctVsMain:
      m.totalMsExGreen > 0 ? Math.round((1000 * (p.totalMsExGreen - m.totalMsExGreen)) / m.totalMsExGreen) / 10 : null,
  };
}

writeFileSync("/opt/cursor/artifacts/profile-main-pr-compare.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
