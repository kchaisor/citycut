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
  CENTRELINE_SIMPLIFY_CURVE_M,
  CENTRELINE_SIMPLIFY_STRAIGHT_M,
  footpathMergedBeforeFillet,
  footpathStrips,
  OUTPUT_SIMPLIFY_M,
  PATH_OUTPUT_SIMPLIFY_M,
} from "../src/lib/roadFill.ts";
import { CLIPPER_ARC_CHORD_M } from "../src/lib/polygonOffset.ts";
import { PLAN_COORD_ROUND_M } from "../src/lib/svgPlan.ts";
import { roundPlanCoord } from "../src/lib/svgPlan.ts";
import { planPaths } from "../src/lib/svgPlan.ts";
import { PATH_WIDTH_M } from "../src/lib/lineweights.ts";
import { curveVertexCount, roadCurveVertexCount } from "../src/lib/planSmoothMetrics.ts";
import { clearFootpathUnionCacheForTests } from "../src/lib/roadFill.ts";

const model = JSON.parse(readFileSync("/opt/cursor/artifacts/jolimont-model.json", "utf8"));

clearFootpathUnionCacheForTests();
const mergedPolys = footpathMergedBeforeFillet(footpathStrips(model.roads, PATH_WIDTH_M), model.sideM, "square");
const filletRadius = Math.max(DEFAULT_PATH_FILLET_M, PATH_WIDTH_M * 1);
const kerbVb = KELVIN_CROPS["kerb-return"];

const kerbStages = footpathFilletStageCounts(
  mergedPolys,
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
    centrelineStraightM: CENTRELINE_SIMPLIFY_STRAIGHT_M,
    centrelineCurveM: CENTRELINE_SIMPLIFY_CURVE_M,
    outputSimplifyM: OUTPUT_SIMPLIFY_M,
    pathOutputSimplifyM: PATH_OUTPUT_SIMPLIFY_M,
    clipperArcChordM: CLIPPER_ARC_CHORD_M,
    svgRoundM: PLAN_COORD_ROUND_M,
  },
  kerbReturnRingMaxVerts: kerbStages,
  facetSpotRoadCurveVertsInCrop: {
    afterFullPlan: roadVertsFinal,
    pathAndRoadCurveVerts: curveVertexCount(prPlan.pathFill, facetVb) + roadVertsFinal,
  },
};

console.log(JSON.stringify(report, null, 2));
writeFileSync("/opt/cursor/artifacts/pipeline-vertex-stages.json", `${JSON.stringify(report, null, 2)}\n`);
