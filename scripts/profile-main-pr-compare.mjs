/**
 * Per-stage planPaths profile: mean of 3 runs, main vs PR (east + jolimont models).
 * Main = faceted unions only; PR = same unions plus ringSmooth pass (see profile-plan-paths.mjs).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

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

mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync("/opt/cursor/artifacts/profile-plan-paths.jsonl", "");

const report = {};
for (const { path, name } of models) {
  report[name] = {
    main: meanRuns(path, `${name}-main`),
    pr: meanRuns(path, `${name}-pr`),
  };
}

writeFileSync("/opt/cursor/artifacts/profile-main-pr-compare.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
