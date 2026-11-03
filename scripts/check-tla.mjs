import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const specPath = path.join(root, "specs", "ReachExplorer.tla");
const spec = fs.readFileSync(specPath, "utf8");
if (!spec.includes("MODULE ReachExplorer")) {
  console.error("ReachExplorer.tla missing MODULE ReachExplorer");
  process.exit(1);
}
for (const token of ["Init", "Next", "TypeOK", "BudgetInvariant"]) {
  if (!spec.includes(token)) {
    console.error(`ReachExplorer.tla missing ${token}`);
    process.exit(1);
  }
}
execFileSync("npm", ["test", "--", "src/lib/reach/reachState.test.ts", "src/lib/reach/reachPtOnly.test.ts"], {
  cwd: root,
  stdio: "inherit",
});
console.log("check:tla OK (ReachExplorer.tla present; TS state machine tests green)");
