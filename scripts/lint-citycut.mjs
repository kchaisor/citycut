import { spawnSync } from "node:child_process";

const args = [
  "vitest",
  "run",
  "src/lib/lint",
  "src/lib/colours.test.ts",
  "src/lib/noTextOutline.test.ts",
  "src/lib/buildingEdges.test.ts",
];

const result = spawnSync("npx", args, { stdio: "inherit", shell: false });
process.exit(result.status ?? 1);
