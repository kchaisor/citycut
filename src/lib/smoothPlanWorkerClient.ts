import { computeSmoothPlanPaths, type PlanPathsRequest } from "./smoothPlanCompute";
import { planModelCutToken } from "./planCutToken";
import type { PlanPaths } from "./svgPlan";
import type { SmoothPlanWorkerIn, SmoothPlanWorkerOut } from "./smoothPlan.worker";

let worker: Worker | null = null;
let workerFailed = false;
let nextJobId = 0;

const pending = new Map<
  number,
  {
    resolve: (plan: PlanPaths) => void;
    reject: (err: Error) => void;
  }
>();

function canUseWorker(): boolean {
  return typeof Worker !== "undefined" && !workerFailed;
}

function getWorker(): Worker | null {
  if (!canUseWorker()) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./smoothPlan.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<SmoothPlanWorkerOut>) => {
      const { id, plan } = event.data;
      const job = pending.get(id);
      if (!job) return;
      pending.delete(id);
      job.resolve(plan);
    };
    worker.onerror = () => {
      workerFailed = true;
      worker?.terminate();
      worker = null;
      for (const [, job] of pending) job.reject(new Error("Smooth plan worker failed"));
      pending.clear();
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

/** Build smooth plan off the main thread when Workers are available. */
export function buildSmoothPlanPathsInWorker(request: PlanPathsRequest): Promise<PlanPaths> {
  const w = getWorker();
  if (!w) return Promise.resolve(computeSmoothPlanPaths(request));

  const id = ++nextJobId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const token = planModelCutToken(request.model);
    const msg: SmoothPlanWorkerIn = { id, token, request };
    w.postMessage(msg);
  });
}

export function terminateSmoothPlanWorkerForTests(): void {
  worker?.terminate();
  worker = null;
  workerFailed = false;
  pending.clear();
  nextJobId = 0;
}
