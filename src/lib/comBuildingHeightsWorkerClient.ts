import type { BuildingFeat } from "../types";
import { applyComBuildingHeights } from "./comBuildingHeightsMatch";
import type { ComBuildingFootprint } from "./comBuildingHeightsTypes";
import type { ComHeightsWorkerRequest, ComHeightsWorkerResponse } from "./comBuildingHeights.worker";

export function runComBuildingHeightsInWorker(
  buildings: BuildingFeat[],
  footprints: ComBuildingFootprint[],
  signal?: AbortSignal,
): Promise<ComHeightsWorkerResponse> {
  if (typeof Worker === "undefined") {
    if (signal?.aborted) {
      return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }
    try {
      const result = applyComBuildingHeights(buildings, footprints);
      return Promise.resolve({ buildings: result.buildings, updated: result.updated });
    } catch {
      return Promise.reject(new Error("City of Melbourne heights could not be applied."));
    }
  }
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./comBuildingHeights.worker.ts", import.meta.url), {
      type: "module",
    });
    const onAbort = () => {
      worker.terminate();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<ComHeightsWorkerResponse>) => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      if (event.data.failed) {
        reject(new Error("City of Melbourne heights could not be applied."));
        return;
      }
      resolve(event.data);
    };
    worker.onerror = () => {
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      reject(new Error("City of Melbourne heights worker failed."));
    };
    const request: ComHeightsWorkerRequest = { buildings, footprints };
    worker.postMessage(request);
  });
}
