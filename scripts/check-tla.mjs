import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const spec = readFileSync("specs/demographicsExplorer.tla", "utf8");
if (!spec.includes("MODULE demographicsExplorer")) {
  console.error("check:tla FAIL missing demographicsExplorer.tla");
  process.exit(1);
}

const vitest = spawnSync(
  process.execPath,
  ["./node_modules/vitest/vitest.mjs", "run", "src/lib/demographicsExplorerReducer.test.ts"],
  { stdio: "inherit", cwd: process.cwd() },
);
if (vitest.status !== 0) process.exit(vitest.status ?? 1);
console.log("check:tla OK");
