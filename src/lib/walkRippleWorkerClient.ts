import {
  assignBuildingArrivalsWithOrigin,
  computeRippleTimesOrigins,
  type RippleTimes,
} from "./walkRippleNetwork";
import type { BuildingFeat, Pt, RoadFeat } from "../types";
import type { WalkRippleWorkerRequest, WalkRippleWorkerResponse } from "./walkRipple.worker";

export type WalkRippleComputeResult = {
  times: RippleTimes;
  arrivals: Map<number, number>;
  originByBuildingId: Map<number, number>;
  ms: number;
};

function mapResponse(data: WalkRippleWorkerResponse): WalkRippleComputeResult {
  return {
    times: data.times,
    arrivals: new Map(data.arrivals),
    originByBuildingId: new Map(data.originByBuildingId),
    ms: data.ms,
  };
}

function computeOnMainThread(
  roads: RoadFeat[],
  buildings: BuildingFeat[],
  origins: Pt[],
): WalkRippleComputeResult {
  const started = performance.now();
  const model = { roads, buildings };
  const times = computeRippleTimesOrigins(model, origins);
  const { arrivals, originByBuildingId } = assignBuildingArrivalsWithOrigin(model, times);
  return {
    times,
    arrivals,
    originByBuildingId,
    ms: performance.now() - started,
  };
}

export function runWalkRippleInWorker(
  roads: RoadFeat[],
  buildings: BuildingFeat[],
  origins: Pt[],
  signal?: AbortSignal,
): Promise<WalkRippleComputeResult> {
  if (typeof Worker === "undefined") {
    if (signal?.aborted) {
      return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }
    return Promise.resolve(computeOnMainThread(roads, buildings, origins));
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./walkRipple.worker.ts", import.meta.url), { type: "module" });
    const onAbort = () => {
      worker.terminate();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<WalkRippleWorkerResponse>) => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      if (event.data.failed) {
        reject(new Error("Walk ripple worker failed."));
        return;
      }
      resolve(mapResponse(event.data));
    };
    worker.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      reject(new Error("Walk ripple worker failed."));
    };
    const request: WalkRippleWorkerRequest = { roads, buildings, origins };
    worker.postMessage(request);
  });
}
