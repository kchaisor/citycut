/**
 * Build preview, run drag bench for main and PR, merge JSON.
 * Usage: node scripts/bench-landing-colour-compare.mjs
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const outDir = "/opt/cursor/artifacts";
mkdirSync(outDir, { recursive: true });

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

for (const branch of ["main", "cursor/landing-drag-colour-pmtiles-70bc"]) {
  run("git", ["checkout", branch]);
  run("npm", ["run", "build"]);
  run("node", ["scripts/bench-landing-drag-colour.mjs", branch === "main" ? "main" : "pr"]);
}

const main = JSON.parse(readFileSync(`${outDir}/bench-landing-drag-colour-main.json`, "utf8"));
const pr = JSON.parse(readFileSync(`${outDir}/bench-landing-drag-colour-pr.json`, "utf8"));
const merged = { generatedAt: new Date().toISOString(), main, pr };
writeFileSync(`${outDir}/bench-landing-drag-colour.json`, JSON.stringify(merged, null, 2));
console.log("Wrote merged bench to", `${outDir}/bench-landing-drag-colour.json`);
