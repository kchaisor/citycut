import type { CityModel } from "../types";
import { PATH_WIDTH_M } from "./lineweights";
import { planModelCutToken } from "./planCutToken";

export { planModelCutToken } from "./planCutToken";
import type { LineStyles } from "./drawingStyle";
import type { BuildingColourMode } from "./buildingViewportColor";
import {
  planPaths,
  type PlanPaths,
  type PlanPathOptions,
  resolvePlanPathQuality,
} from "./svgPlan";
import { computeSmoothPlanPaths, type PlanPathsRequest } from "./smoothPlanCompute";
import {
  buildSmoothPlanPathsInWorker,
  terminateSmoothPlanWorkerForTests,
} from "./smoothPlanWorkerClient";

export type { PlanPathsRequest };

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
  return computeSmoothPlanPaths(request);
}

type SmoothJob = {
  token: string;
  promise: Promise<PlanPaths>;
};

let activeSmoothJob: SmoothJob | null = null;

export function resetPlanPathsSessionForTests(): void {
  activeSmoothJob = null;
  terminateSmoothPlanWorkerForTests();
}

function scheduleSmoothCompute(request: PlanPathsRequest): Promise<PlanPaths> {
  return buildSmoothPlanPathsInWorker(request);
}

/** Start or reuse background smooth plan build for the current cut (Web Worker when available). */
export function beginBackgroundSmoothPlan(request: PlanPathsRequest): Promise<PlanPaths> {
  const token = planModelCutToken(request.model);
  if (activeSmoothJob?.token === token) return activeSmoothJob.promise;
  const promise = scheduleSmoothCompute(request).finally(() => {
    if (activeSmoothJob?.token === token && activeSmoothJob.promise === promise) {
      activeSmoothJob = null;
    }
  });
  activeSmoothJob = { token, promise };
  return promise;
}

/** Export and download paths: await in-flight smooth work or compute (worker or sync fallback). */
export async function ensureSmoothPlanPaths(request: PlanPathsRequest): Promise<PlanPaths> {
  const token = planModelCutToken(request.model);
  if (activeSmoothJob?.token === token) return activeSmoothJob.promise;
  return buildSmoothPlanPathsInWorker(request);
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

/** Rough ring-vertex count for tests comparing fast vs smooth fills. */
export function planFillVertexCount(plan: PlanPaths): number {
  let count = 0;
  for (const polygon of plan.pathFill) {
    for (const ring of polygon) count += ring.length;
  }
  for (const polygon of plan.roadFill) {
    for (const ring of polygon) count += ring.length;
  }
  return count;
}

export function isSmoothQuality(options: PlanPathOptions): boolean {
  return resolvePlanPathQuality(options) === "smooth";
}
