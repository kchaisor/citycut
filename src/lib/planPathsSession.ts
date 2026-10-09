import type { CityModel } from "../types";
import { PATH_WIDTH_M } from "./lineweights";
import { snapshotPlanColours } from "./colours";

export { planModelCutToken } from "./planCutToken";
export { planSmoothJobKey } from "./planSmoothJobKey";
import type { LineStyles } from "./drawingStyle";
import type { BuildingColourMode } from "./buildingViewportColor";
import { planPaths, type PlanPaths, type PlanPathOptions } from "./svgPlan";
import { computeSmoothPlanPaths, type PlanPathsRequest } from "./smoothPlanCompute";
import { planSmoothJobKey } from "./planSmoothJobKey";
import {
  buildSmoothPlanPathsInWorker,
  terminateSmoothPlanWorkerForTests,
} from "./smoothPlanWorkerClient";

export type { PlanPathsRequest };

export function withColourSnapshot(request: PlanPathsRequest): PlanPathsRequest {
  if (request.colourSnapshot && Object.keys(request.colourSnapshot).length > 0) return request;
  return { ...request, colourSnapshot: snapshotPlanColours() };
}

function fastPlanOptions(planOptions: PlanPathOptions = {}): PlanPathOptions {
  return {
    ...planOptions,
    quality: "fast",
    smoothOutput: false,
    centrelineSmooth: false,
  };
}

export function buildPlanPaths(request: PlanPathsRequest): PlanPaths {
  const {
    model,
    pathWidthM = PATH_WIDTH_M,
    contourIndexEvery = 5,
    planScale = 1000,
    coarseIntervalM,
    coarseFromScale,
    planOptions = {},
  } = request;
  return planPaths(model, pathWidthM, contourIndexEvery, planScale, coarseIntervalM, coarseFromScale, planOptions);
}

export function buildFastPlanPaths(request: PlanPathsRequest): PlanPaths {
  return buildPlanPaths({
    ...request,
    planOptions: fastPlanOptions(request.planOptions),
  });
}

export function buildSmoothPlanPaths(request: PlanPathsRequest): PlanPaths {
  return computeSmoothPlanPaths(withColourSnapshot(request));
}

type SmoothJob = {
  jobKey: string;
  promise: Promise<PlanPaths>;
};

let activeSmoothJob: SmoothJob | null = null;

export function resetPlanPathsSessionForTests(): void {
  activeSmoothJob = null;
  terminateSmoothPlanWorkerForTests();
}

function scheduleSmoothCompute(request: PlanPathsRequest): Promise<PlanPaths> {
  return buildSmoothPlanPathsInWorker(withColourSnapshot(request));
}

/** Start or reuse background smooth plan build for the current cut (Web Worker when available). */
export function beginBackgroundSmoothPlan(request: PlanPathsRequest): Promise<PlanPaths> {
  const req = withColourSnapshot(request);
  const jobKey = planSmoothJobKey(req);
  if (activeSmoothJob?.jobKey === jobKey) return activeSmoothJob.promise;
  const promise = scheduleSmoothCompute(req).finally(() => {
    if (activeSmoothJob?.jobKey === jobKey && activeSmoothJob.promise === promise) {
      activeSmoothJob = null;
    }
  });
  activeSmoothJob = { jobKey, promise };
  return promise;
}

/** Export and download paths: await in-flight smooth work or compute (worker or sync fallback). */
export async function ensureSmoothPlanPaths(request: PlanPathsRequest): Promise<PlanPaths> {
  const req = withColourSnapshot(request);
  const jobKey = planSmoothJobKey(req);
  if (activeSmoothJob?.jobKey === jobKey) return activeSmoothJob.promise;
  return buildSmoothPlanPathsInWorker(req);
}

export function planPathsFromSiteStyle(
  model: CityModel,
  scale: number,
  style: LineStyles,
  exportOpts: {
    uniformBuildings?: boolean;
    colourBySource?: boolean;
    highlightManual?: boolean;
  } = {},
): PlanPathsRequest {
  const buildingColour: BuildingColourMode = {
    colourByUse: !exportOpts.uniformBuildings && !exportOpts.colourBySource,
    uniformBuildings: Boolean(exportOpts.uniformBuildings),
    colourBySource: Boolean(exportOpts.colourBySource),
  };
  return {
    model,
    pathWidthM: style.pathWidthM,
    contourIndexEvery: style.contourIndexEvery,
    planScale: scale,
    coarseIntervalM: style.contourCoarseIntervalM,
    coarseFromScale: style.contourCoarseFromScale,
    planOptions: {
      buildingColour,
      highlightManual: exportOpts.highlightManual,
      pathFilletM: style.pathFilletM,
      quality: "smooth",
    },
  };
}
