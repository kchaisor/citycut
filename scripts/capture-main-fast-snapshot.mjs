#!/usr/bin/env node
/**
 * Writes src/lib/fixtures/east-melbourne-fast-plan-d.snapshot.txt using only
 * origin/main modules in a detached worktree (default commit 8fb47f6).
 *
 * Usage (repo root): node scripts/capture-main-fast-snapshot.mjs [commit]
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const commit = process.argv[2] ?? "8fb47f6";
const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const work = mkdtempSync(join(tmpdir(), "citycut-main-snap-"));
const dest = join(repoRoot, "src/lib/fixtures/east-melbourne-fast-plan-d.snapshot.txt");

const captureTest = `import { readFileSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import type { CityModel } from "../types";
import { DEFAULT_LINE_STYLES } from "./drawingStyle";
import { PATH_WIDTH_M } from "./lineweights";
import { planPaths, svgRings } from "./svgPlan";

const OUT = process.env.MAIN_FAST_SNAPSHOT_OUT;

describe("capture main fast plan d snapshot", () => {
  it("writes road/path d strings from main planPaths", () => {
    if (!OUT) return;
    const raw = readFileSync(new URL("./fixtures/east-melbourne-path-trim.json", import.meta.url), "utf8");
    const model = JSON.parse(raw) as CityModel;
    const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
      pathFilletM: DEFAULT_LINE_STYLES.pathFilletM,
    });
    const road = plan.roadFill.map((polygon) => svgRings(polygon)).join(" ");
    const path = plan.pathFill.map((polygon) => svgRings(polygon)).join(" ");
    writeFileSync(OUT, road + "\\n" + path);
  });
});
`;

try {
  execSync(`git worktree add --detach "${work}" ${commit}`, { cwd: repoRoot, stdio: "inherit" });
  execSync("npm ci", { cwd: work, stdio: "inherit" });
  const testPath = join(work, "src/lib/_captureMainFastSnapshot.test.ts");
  writeFileSync(testPath, captureTest);
  execSync("npm test -- src/lib/_captureMainFastSnapshot.test.ts", {
    cwd: work,
    stdio: "inherit",
    env: { ...process.env, MAIN_FAST_SNAPSHOT_OUT: dest },
  });
  const generated = readFileSync(dest, "utf8");
  console.log("wrote", dest, generated.length, "chars");
} finally {
  execSync(`git worktree remove --force "${work}"`, { cwd: repoRoot, stdio: "inherit" });
}
