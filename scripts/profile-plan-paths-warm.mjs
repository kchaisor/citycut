/**
 * First planPaths call cold; second call uses union/display caches (typical redraw).
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";
import { planPaths } from "../src/lib/svgPlan.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";

const modelPath = process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json";
const model = JSON.parse(readFileSync(modelPath, "utf8"));
const opts = { pathFilletM: 2, smoothOutput: true, centrelineSmooth: false };

clearFootpathUnionCacheForTests();
const tCold = performance.now();
planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, opts);
const coldMs = Math.round(performance.now() - tCold);

const tWarm = performance.now();
planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, opts);
const warmMs = Math.round(performance.now() - tWarm);

console.log(JSON.stringify({ model: modelPath, coldMs, warmMs }, null, 2));
