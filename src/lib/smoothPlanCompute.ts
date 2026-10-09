import type { ColourKey } from "./colours";
import { runWithPlanColours } from "./colours";
import { PATH_WIDTH_M } from "./lineweights";
import { planPaths, type PlanPaths, type PlanPathsBuildArgs, type PlanPathOptions } from "./svgPlan";
import type { CityModel } from "../types";

export type PlanPathsRequest = PlanPathsBuildArgs & {
  model: CityModel;
  /** Main-thread snapshot of theme fills; required for worker builds. */
  colourSnapshot?: Partial<Record<ColourKey, string>>;
};

function smoothPlanOptions(planOptions: PlanPathOptions = {}): PlanPathOptions {
  return {
    ...planOptions,
    quality: "smooth",
    smoothOutput: true,
    centrelineSmooth: planOptions.centrelineSmooth !== false,
  };
}

function buildSmoothPlanPathsInner(request: PlanPathsRequest): PlanPaths {
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

/** Synchronous smooth plan build (main thread fallback, worker entry, exports). */
export function computeSmoothPlanPaths(request: PlanPathsRequest): PlanPaths {
  const snapshot = request.colourSnapshot;
  if (snapshot && Object.keys(snapshot).length > 0) {
    return runWithPlanColours(snapshot, () => buildSmoothPlanPathsInner(request));
  }
  return buildSmoothPlanPathsInner(request);
}

/** Same entry point the Web Worker runs (for tests without Worker). */
export function runSmoothPlanWorkerJob(request: PlanPathsRequest): PlanPaths {
  if (!request.colourSnapshot || Object.keys(request.colourSnapshot).length === 0) {
    throw new Error("Smooth plan worker job requires colourSnapshot from the main thread.");
  }
  return computeSmoothPlanPaths(request);
}
