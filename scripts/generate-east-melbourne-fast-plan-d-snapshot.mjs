#!/usr/bin/env node
/**
 * Writes src/lib/fixtures/east-melbourne-fast-plan-d.snapshot.txt from origin/main planPaths.
 * Usage (from repo root): node scripts/generate-east-melbourne-fast-plan-d-snapshot.mjs [commit]
 * Default commit: 8fb47f6
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const commit = process.argv[2] ?? "8fb47f6";
const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const work = mkdtempSync(join(tmpdir(), "citycut-main-snap-"));

try {
  execSync(`git worktree add --detach "${work}" ${commit}`, { cwd: repoRoot, stdio: "inherit" });
  execSync("npm ci", { cwd: work, stdio: "inherit" });
  const genTest = join(repoRoot, "src/lib/generateEastMelbourneFastSnapshot.test.ts");
  execSync(`cp ${JSON.stringify(genTest)} ${JSON.stringify(join(work, "src/lib/generateEastMelbourneFastSnapshot.test.ts"))}`);
  execSync("npm test -- src/lib/generateEastMelbourneFastSnapshot.test.ts", {
    cwd: work,
    stdio: "inherit",
    env: { ...process.env, GENERATE_FAST_SNAPSHOT: "1" },
  });
  const outPath = join(work, "src/lib/fixtures/east-melbourne-fast-plan-d.snapshot.txt");
  const generated = readFileSync(outPath, "utf8");
  const dest = join(repoRoot, "src/lib/fixtures/east-melbourne-fast-plan-d.snapshot.txt");
  writeFileSync(dest, generated);
  console.log("wrote", dest, generated.length, "chars");
} finally {
  execSync(`git worktree remove --force "${work}"`, { cwd: repoRoot, stdio: "inherit" });
}
