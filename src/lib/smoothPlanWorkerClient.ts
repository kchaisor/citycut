import { computeSmoothPlanPaths, type PlanPathsRequest } from "./smoothPlanCompute";
import { planModelCutToken } from "./planCutToken";
import { planSmoothJobKey } from "./planSmoothJobKey";
import type { PlanPaths } from "./svgPlan";
import type { SmoothPlanWorkerIn, SmoothPlanWorkerOut } from "./smoothPlan.worker";

export class SupersededSmoothPlanJob extends Error {
  override name = "SupersededSmoothPlanJob";
}

let worker: Worker | null = null;
let workerFailed = false;
let nextJobId = 0;
/** Latest requested job; worker responses for other keys are dropped. */
let latestJobKey = "";

const pending = new Map<
  number,
  {
    jobKey: string;
    resolve: (plan: PlanPaths) => void;
    reject: (err: Error) => void;
  }
>();

function canUseWorker(): boolean {
  return typeof Worker !== "undefined" && !workerFailed;
}

function attachWorkerHandlers(w: Worker): void {
  w.onmessage = (event: MessageEvent<SmoothPlanWorkerOut>) => {
    const { id, jobKey, plan } = event.data;
    if (jobKey !== latestJobKey) return;
    const job = pending.get(id);
    if (!job || job.jobKey !== jobKey) return;
    pending.delete(id);
    job.resolve(plan);
  };
  w.onerror = () => {
    workerFailed = true;
    worker?.terminate();
    worker = null;
    for (const [, job] of pending) job.reject(new Error("Smooth plan worker failed"));
    pending.clear();
  };
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./smoothPlan.worker.ts", import.meta.url), { type: "module" });
  attachWorkerHandlers(worker);
  return worker;
}

function bumpToJobKey(jobKey: string): void {
  if (jobKey === latestJobKey) return;
  latestJobKey = jobKey;
  for (const [id, job] of pending) {
    pending.delete(id);
    job.reject(new SupersededSmoothPlanJob());
  }
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

/** Build smooth plan off the main thread when Workers are available. */
export function buildSmoothPlanPathsInWorker(request: PlanPathsRequest): Promise<PlanPaths> {
  const jobKey = planSmoothJobKey(request);
  if (!canUseWorker()) return Promise.resolve(computeSmoothPlanPaths(request));

  bumpToJobKey(jobKey);

  const id = ++nextJobId;
  return new Promise((resolve, reject) => {
    pending.set(id, { jobKey, resolve, reject });
    const w = getWorker();
    const msg: SmoothPlanWorkerIn = {
      id,
      jobKey,
      token: planModelCutToken(request.model),
      request,
    };
    w.postMessage(msg);
  });
}

export function terminateSmoothPlanWorkerForTests(): void {
  worker?.terminate();
  worker = null;
  workerFailed = false;
  pending.clear();
  nextJobId = 0;
  latestJobKey = "";
}
