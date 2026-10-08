import type { CityModel } from "../types";
import { PATH_WIDTH_M } from "./lineweights";
import type { LineStyles } from "./drawingStyle";
import type { BuildingColourMode } from "./buildingViewportColor";
import {
  planPaths,
  type PlanPaths,
  type PlanPathsBuildArgs,
  type PlanPathOptions,
  resolvePlanPathQuality,
} from "./svgPlan";

export type PlanPathsRequest = PlanPathsBuildArgs & {
  model: CityModel;
};

export function planModelCutToken(model: CityModel): string {
  const blocks = model.blocks?.length ?? 0;
  return `${model.sideM}:${model.center.lat.toFixed(6)}:${model.center.lon.toFixed(6)}:${model.roads.length}:${model.buildings.length}:${model.areas.length}:${blocks}`;
}

function smoothPlanOptions(planOptions: PlanPathOptions = {}): PlanPathOptions {
  return {
    ...planOptions,
    quality: "smooth",
    smoothOutput: true,
    centrelineSmooth: planOptions.centrelineSmooth !== false,
  };
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
  return buildPlanPaths({
    ...request,
    planOptions: smoothPlanOptions(request.planOptions),
  });
}

type SmoothJob = {
  token: string;
  promise: Promise<PlanPaths>;
};

let activeSmoothJob: SmoothJob | null = null;

export function resetPlanPathsSessionForTests(): void {
  activeSmoothJob = null;
}

function scheduleSmoothCompute(request: PlanPathsRequest): Promise<PlanPaths> {
  const run = () => buildSmoothPlanPaths(request);
  const idle = globalThis.requestIdleCallback;
  if (typeof idle === "function") {
    return new Promise((resolve) => {
      idle(
        () => {
          resolve(run());
        },
        { timeout: 5000 },
      );
    });
  }
  return Promise.resolve().then(run);
}

/** Start or reuse background smooth plan build for the current cut. */
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

/** Export and download paths: await in-flight smooth work or compute synchronously. */
export async function ensureSmoothPlanPaths(request: PlanPathsRequest): Promise<PlanPaths> {
  const token = planModelCutToken(request.model);
  if (activeSmoothJob?.token === token) return activeSmoothJob.promise;
  return buildSmoothPlanPaths(request);
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
