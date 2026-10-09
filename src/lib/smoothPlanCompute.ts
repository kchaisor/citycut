import { PATH_WIDTH_M } from "./lineweights";
import { planPaths, type PlanPaths, type PlanPathsBuildArgs, type PlanPathOptions } from "./svgPlan";
import type { CityModel } from "../types";

export type PlanPathsRequest = PlanPathsBuildArgs & {
  model: CityModel;
};

function smoothPlanOptions(planOptions: PlanPathOptions = {}): PlanPathOptions {
  return {
    ...planOptions,
    quality: "smooth",
    smoothOutput: true,
    centrelineSmooth: planOptions.centrelineSmooth !== false,
  };
}

/** Synchronous smooth plan build (main thread fallback, worker entry, exports). */
export function computeSmoothPlanPaths(request: PlanPathsRequest): PlanPaths {
  const {
    model,
    pathWidthM = PATH_WIDTH_M,
    contourIndexEvery = 5,
    planScale = 1000,
    coarseIntervalM,
    coarseFromScale,
    planOptions = {},
  } = request;
  return planPaths(model, pathWidthM, contourIndexEvery, planScale, coarseIntervalM, coarseFromScale, {
    ...smoothPlanOptions(planOptions),
  });
}

/** Same entry point the Web Worker runs (for tests without Worker). */
export function runSmoothPlanWorkerJob(request: PlanPathsRequest): PlanPaths {
  return computeSmoothPlanPaths(request);
}
