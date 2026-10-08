/**
 * Centreline Chaikin stats for 1 km East Melbourne footpath strips.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { centrelineSmoothStats } from "../src/lib/centrelineSmooth.ts";
import { footpathStrips, PATH_OUTPUT_SIMPLIFY_M, stitchFootpathStrips } from "../src/lib/roadFill.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const modelPath = process.argv[2] ?? "/opt/cursor/artifacts/east-model.json";
const label = process.argv[3] ?? "pr";
const model = JSON.parse(readFileSync(modelPath, "utf8"));
const strips = stitchFootpathStrips(footpathStrips(model.roads, PATH_WIDTH_M));
const stats = centrelineSmoothStats(strips, undefined, { simplifyM: PATH_OUTPUT_SIMPLIFY_M });
const row = { label, ...stats };
writeFileSync("/opt/cursor/artifacts/centreline-smooth-stats.json", JSON.stringify(row, null, 2));
console.log(JSON.stringify(row));
