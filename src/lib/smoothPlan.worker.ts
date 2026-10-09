import { computeSmoothPlanPaths, type PlanPathsRequest } from "./smoothPlanCompute";
import type { PlanPaths } from "./svgPlan";

export type SmoothPlanWorkerIn = {
  id: number;
  token: string;
  request: PlanPathsRequest;
};

export type SmoothPlanWorkerOut = {
  id: number;
  token: string;
  plan: PlanPaths;
};

/** Exported for unit tests (no Worker required). */
export function runSmoothPlanWorkerJob(request: PlanPathsRequest): PlanPaths {
  return computeSmoothPlanPaths(request);
}

self.onmessage = (event: MessageEvent<SmoothPlanWorkerIn>) => {
  const { id, token, request } = event.data;
  const plan = runSmoothPlanWorkerJob(request);
  const out: SmoothPlanWorkerOut = { id, token, plan };
  self.postMessage(out);
};
