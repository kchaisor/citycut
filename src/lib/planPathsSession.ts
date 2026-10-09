import type { CityModel, Pt } from "../types";
import { PATH_WIDTH_M } from "./lineweights";
import type { LineStyles } from "./drawingStyle";
import type { BuildingColourMode } from "./buildingViewportColor";
import {
  assemblePlanPaths,
  planPaths,
  planPathsPreamble,
  type PlanPaths,
  type PlanPathsBuildArgs,
  type PlanPathOptions,
  resolvePlanPathQuality,
} from "./svgPlan";
import {
  DEFAULT_PATH_FILLET_M,
  footpathStrips,
  unionFootpathStripsAsync,
  unionRoadSurfaceAsync,
} from "./roadFill";
import { DEFAULT_COARSE_FROM_SCALE, DEFAULT_COARSE_INTERVAL_M } from "./vicmapContours";
import { PlanUnionCancelled, createPlanSliceController } from "./planUnionSlice";

export type PlanPathsRequest = PlanPathsBuildArgs & {
  model: CityModel;
};

function mixCutHash(hash: number, value: number): number {
  return Math.imul(hash ^ value, 16777619) >>> 0;
}

function hashLine(hash: number, line: Pt[]): number {
  let h = mixCutHash(hash, line.length);
  for (const [x, y] of line) {
    h = mixCutHash(h, Math.round(x * 100));
    h = mixCutHash(h, Math.round(y * 100));
  }
  return h;
}

/** Stable per-cut identity from frame and geometry (not feature counts alone). */
export function planModelCutToken(model: CityModel): string {
  let h = 2166136261;
  h = mixCutHash(h, Math.round(model.sideM));
  h = mixCutHash(h, Math.round(model.center.lat * 1e6));
  h = mixCutHash(h, Math.round(model.center.lon * 1e6));
  h = mixCutHash(h, model.frameShape === "circle" ? 1 : 0);
  for (const road of model.roads) {
    h = mixCutHash(h, road.id);
    h = mixCutHash(h, Math.round(road.width * 100));
    h = hashLine(h, road.line);
  }
  for (const building of model.buildings) {
    h = mixCutHash(h, building.id);
    h = hashLine(h, building.ring);
    h = mixCutHash(h, building.holes.length);
    for (const hole of building.holes) h = hashLine(h, hole);
  }
  for (const area of model.areas) {
    h = mixCutHash(h, area.id);
    h = hashLine(h, area.ring);
    for (const hole of area.holes) h = hashLine(h, hole);
  }
  for (const block of model.blocks ?? []) {
    h = hashLine(h, block.ring);
    for (const hole of block.holes) h = hashLine(h, hole);
  }
  for (const line of model.tramLines ?? []) h = hashLine(h, line);
  return `${model.sideM}:${model.center.lat.toFixed(6)}:${model.center.lon.toFixed(6)}:${h.toString(16)}`;
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

/** Same as {@link buildSmoothPlanPaths} but yields during long plan unions (idle smooth). */
export async function buildSmoothPlanPathsChunked(
  request: PlanPathsRequest,
  isValid: () => boolean,
  sliceBudgetMs = 90,
): Promise<PlanPaths | null> {
  const {
    model,
    pathWidthM = PATH_WIDTH_M,
    contourIndexEvery = 5,
    planScale = 1000,
    coarseIntervalM,
    coarseFromScale,
    planOptions: rawOptions = {},
  } = request;
  const planOptions = smoothPlanOptions(rawOptions);
  const pathFilletM =
    planOptions.pathFilletM !== undefined ? planOptions.pathFilletM : DEFAULT_PATH_FILLET_M;
  const preamble = planPathsPreamble(model);
  if (!isValid()) return null;

  const slice = createPlanSliceController(isValid, sliceBudgetMs);
  try {
    const footpaths = await unionFootpathStripsAsync(
      footpathStrips(model.roads, pathWidthM),
      model.sideM,
      preamble.frameShape,
      pathFilletM,
      pathWidthM,
      "smooth",
      slice,
    );
    if (!isValid()) return null;

    const carriageway = await unionRoadSurfaceAsync(
      model.roads,
      model.tramLines,
      model.sideM,
      preamble.frameShape,
      "smooth",
      slice,
    );
    if (!isValid()) return null;

    return assemblePlanPaths(
      model,
      footpaths,
      carriageway,
      pathWidthM,
      contourIndexEvery,
      planScale,
      coarseIntervalM ?? DEFAULT_COARSE_INTERVAL_M,
      coarseFromScale ?? DEFAULT_COARSE_FROM_SCALE,
      planOptions,
      preamble,
    );
  } catch (err) {
    if (err instanceof PlanUnionCancelled) return null;
    throw err;
  }
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
  const token = planModelCutToken(request.model);
  const isValid = () => planModelCutToken(request.model) === token;
  return buildSmoothPlanPathsChunked(request, isValid).then((plan) => {
    if (!plan) throw new Error("Smooth plan build cancelled");
    return plan;
  });
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
