import { runSmoothPlanWorkerJob, type PlanPathsRequest } from "./smoothPlanCompute";
import type { PlanPaths } from "./svgPlan";

export type SmoothPlanWorkerIn = {
  id: number;
  jobKey: string;
  token: string;
  request: PlanPathsRequest;
};

export type SmoothPlanWorkerOut = {
  id: number;
  jobKey: string;
  token: string;
  plan: PlanPaths;
};

self.onmessage = (event: MessageEvent<SmoothPlanWorkerIn>) => {
  const { id, jobKey, token, request } = event.data;
  const plan = runSmoothPlanWorkerJob(request);
  const out: SmoothPlanWorkerOut = { id, jobKey, token, plan };
  self.postMessage(out);
};
