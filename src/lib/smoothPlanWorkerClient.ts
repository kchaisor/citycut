import { computeSmoothPlanPaths, type PlanPathsRequest } from "./smoothPlanCompute";
import { planModelCutToken } from "./planCutToken";
import {
  planSmoothJobKey,
  type SmoothPlanConsumer,
} from "./planSmoothJobKey";
import type { PlanPaths } from "./svgPlan";
import type { SmoothPlanWorkerIn, SmoothPlanWorkerOut } from "./smoothPlan.worker";

export class SupersededSmoothPlanJob extends Error {
  override name = "SupersededSmoothPlanJob";
}

type PendingJob = {
  jobKey: string;
  resolve: (plan: PlanPaths) => void;
  reject: (err: Error) => void;
};

type WorkerPool = {
  worker: Worker | null;
  workerFailed: boolean;
  latestJobKey: string;
  pending: Map<number, PendingJob>;
  nextJobId: number;
};

function createPool(): WorkerPool {
  return {
    worker: null,
    workerFailed: false,
    latestJobKey: "",
    pending: new Map(),
    nextJobId: 0,
  };
}

const pools: Record<SmoothPlanConsumer, WorkerPool> = {
  display: createPool(),
  export: createPool(),
};

function canUseWorker(pool: WorkerPool): boolean {
  return typeof Worker !== "undefined" && !pool.workerFailed;
}

function attachWorkerHandlers(pool: WorkerPool, w: Worker): void {
  w.onmessage = (event: MessageEvent<SmoothPlanWorkerOut>) => {
    const { id, jobKey, plan } = event.data;
    if (jobKey !== pool.latestJobKey) return;
    const job = pool.pending.get(id);
    if (!job || job.jobKey !== jobKey) return;
    pool.pending.delete(id);
    job.resolve(plan);
  };
  w.onerror = () => {
    pool.workerFailed = true;
    pool.worker?.terminate();
    pool.worker = null;
    for (const [, job] of pool.pending) job.reject(new Error("Smooth plan worker failed"));
    pool.pending.clear();
  };
}

function getWorker(pool: WorkerPool): Worker {
  if (pool.worker) return pool.worker;
  pool.worker = new Worker(new URL("./smoothPlan.worker.ts", import.meta.url), { type: "module" });
  attachWorkerHandlers(pool, pool.worker);
  return pool.worker;
}

function bumpToJobKey(pool: WorkerPool, jobKey: string): void {
  if (jobKey === pool.latestJobKey) return;
  pool.latestJobKey = jobKey;
  for (const [id, job] of pool.pending) {
    pool.pending.delete(id);
    job.reject(new SupersededSmoothPlanJob());
  }
  if (pool.worker) {
    pool.worker.terminate();
    pool.worker = null;
  }
}

/** Build smooth plan off the main thread when Workers are available. */
export function buildSmoothPlanPathsInWorker(
  request: PlanPathsRequest,
  consumer: SmoothPlanConsumer,
): Promise<PlanPaths> {
  const pool = pools[consumer];
  const jobKey = planSmoothJobKey(request, consumer);
  if (!canUseWorker(pool)) return Promise.resolve(computeSmoothPlanPaths(request));

  bumpToJobKey(pool, jobKey);

  const id = ++pool.nextJobId;
  return new Promise((resolve, reject) => {
    pool.pending.set(id, { jobKey, resolve, reject });
    const w = getWorker(pool);
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
  for (const pool of Object.values(pools)) {
    pool.worker?.terminate();
    pool.worker = null;
    pool.workerFailed = false;
    pool.pending.clear();
    pool.nextJobId = 0;
    pool.latestJobKey = "";
  }
}
