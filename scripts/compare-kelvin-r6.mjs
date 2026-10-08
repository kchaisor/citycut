/**
 * Pixel + fill-area check vs r6 PR crops and planPaths fills.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const outDir = "/opt/cursor/artifacts";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const modelPath = process.argv[2] ?? "/opt/cursor/artifacts/jolimont-model.json";
const model = JSON.parse(readFileSync(modelPath, "utf8"));

const shots = ["facet-spot", "kerb-return", "path-kink", "road-gaps"];

function md5(path) {
  return createHash("md5").update(readFileSync(path)).digest("hex");
}

function multiArea(multi) {
  let area = 0;
  for (const polygon of multi) {
    const outer = polygon[0];
    if (!outer) continue;
    area += ringArea(outer);
    for (const hole of polygon.slice(1)) area -= ringArea(hole);
  }
  return area;
}

function ringArea(ring) {
  const open = ring.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < open.length; i++) {
    const [x1, y1] = open[i];
    const [x2, y2] = open[(i + 1) % open.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

const { planPaths } = await import(pathToFileURL(join(repoRoot, "src/lib/svgPlan.ts")).href);
const { PATH_WIDTH_M } = await import(pathToFileURL(join(repoRoot, "src/lib/lineweights.ts")).href);
const { clearFootpathUnionCacheForTests } = await import(pathToFileURL(join(repoRoot, "src/lib/roadFill.ts")).href);

clearFootpathUnionCacheForTests();
const plan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, {
  pathFilletM: 2,
  centrelineSmooth: true,
  smoothOutput: true,
});

const pixels = {};
for (const name of shots) {
  const pr = `${outDir}/${name}-pr.png`;
  const r6 = `${outDir}/${name}-r6.png`;
  pixels[name] = {
    prMd5: existsSync(pr) ? md5(pr) : null,
    r6Md5: existsSync(r6) ? md5(r6) : null,
    identical: existsSync(pr) && existsSync(r6) ? md5(pr) === md5(r6) : false,
  };
}

const report = {
  model: modelPath,
  pixels,
  fillAreaM2: {
    road: multiArea(plan.roadFill),
    footpath: multiArea(plan.pathFill),
  },
  note: "Store baseline fill areas in kelvin-r6-fill-baseline.json after r6 lock",
};

const baselinePath = `${outDir}/kelvin-r6-fill-baseline-lock.json`;
if (existsSync(baselinePath)) {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  report.fillAreaDeltaPct = {
    road: (100 * Math.abs(report.fillAreaM2.road - baseline.road)) / baseline.road,
    footpath: (100 * Math.abs(report.fillAreaM2.footpath - baseline.footpath)) / baseline.footpath,
  };
} else {
  writeFileSync(
    baselinePath,
    JSON.stringify({ road: report.fillAreaM2.road, footpath: report.fillAreaM2.footpath }, null, 2),
  );
  report.fillAreaDeltaPct = { road: 0, footpath: 0 };
}

writeFileSync(`${outDir}/kelvin-r6-compare.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
