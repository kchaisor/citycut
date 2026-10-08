/**
 * Prove where vertices are lost: Clipper fillet → simplify → SVG round.
 * Run: npx vite-node scripts/pipeline-vertex-stages.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { KELVIN_CROPS } from "../src/lib/planSmoothMetrics.ts";
import {
  DEFAULT_PATH_FILLET_M,
  footpathFilletStageCounts,
  footpathStrips,
  OUTPUT_SIMPLIFY_M,
  PATH_OUTPUT_SIMPLIFY_M,
  stitchFootpathStrips,
  unionStrips,
} from "../src/lib/roadFill.ts";
import { roundPlanCoord } from "../src/lib/svgPlan.ts";
import { planPaths } from "../src/lib/svgPlan.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";
import { curveVertexCount, roadCurveVertexCount } from "../src/lib/planSmoothMetrics.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";

const model = JSON.parse(readFileSync("/opt/cursor/artifacts/jolimont-model.json", "utf8"));

clearFootpathUnionCacheForTests();
const strips = stitchFootpathStrips(footpathStrips(model.roads, PATH_WIDTH_M));
const merged = unionStrips(strips, model.sideM, 0, "square");
const filletRadius = Math.max(DEFAULT_PATH_FILLET_M, PATH_WIDTH_M * 1);
const kerbVb = KELVIN_CROPS["kerb-return"];

const kerbStages = footpathFilletStageCounts(
  merged.polygons,
  filletRadius,
  model.sideM,
  kerbVb,
  "square",
  roundPlanCoord,
);

clearFootpathUnionCacheForTests();
const prPlan = planPaths(model, PATH_WIDTH_M, 5, 500, 5, 2500, { pathFilletM: 2, smoothOutput: true });
const facetVb = KELVIN_CROPS["facet-spot"];
const roadVertsFinal = roadCurveVertexCount(prPlan.roadFill, facetVb);

const report = {
  tolerances: {
    centrelineStraightM: 0.35,
    centrelineCurveM: 0.04,
    outputSimplifyM: OUTPUT_SIMPLIFY_M,
    pathOutputSimplifyM: PATH_OUTPUT_SIMPLIFY_M,
    clipperArcChordM: 0.01,
    svgRoundM: 0.01,
  },
  kerbReturnRingMaxVerts: kerbStages,
  facetSpotRoadCurveVertsInCrop: {
    afterFullPlan: roadVertsFinal,
    pathAndRoadCurveVerts: curveVertexCount(prPlan.pathFill, facetVb) + roadVertsFinal,
  },
};

console.log(JSON.stringify(report, null, 2));
writeFileSync("/opt/cursor/artifacts/pipeline-vertex-stages.json", `${JSON.stringify(report, null, 2)}\n`);
