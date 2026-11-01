import {
  assignBuildingArrivalsWithOrigin,
  computeRippleTimesOrigins,
  type RippleTimes,
} from "./walkRippleNetwork";
import type { BuildingFeat, Pt, RoadFeat } from "../types";

export type WalkRippleWorkerRequest = {
  roads: RoadFeat[];
  buildings: BuildingFeat[];
  origins: Pt[];
};

export type WalkRippleWorkerResponse = {
  times: RippleTimes;
  arrivals: Array<[number, number]>;
  originByBuildingId: Array<[number, number]>;
  ms: number;
  failed?: boolean;
};

type WorkerScope = {
  onmessage: ((event: MessageEvent<WalkRippleWorkerRequest>) => void) | null;
  postMessage: (message: WalkRippleWorkerResponse, transfer?: Transferable[]) => void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<WalkRippleWorkerRequest>) => {
  const started = performance.now();
  try {
    const { roads, buildings, origins } = event.data;
    const model = { roads, buildings };
    const times = computeRippleTimesOrigins(model, origins);
    const { arrivals, originByBuildingId } = assignBuildingArrivalsWithOrigin(model, times);
    const transfer: Transferable[] = [];
    if (times.mode === "network") {
      transfer.push(
        times.nodeTimesMin.buffer,
        times.nodeOriginId.buffer,
        times.edgeVertexTimes.buffer,
        times.edgeVertexOriginId.buffer,
        times.seamSegments.buffer,
      );
    }
    scope.postMessage(
      {
        times,
        arrivals: [...arrivals.entries()],
        originByBuildingId: [...originByBuildingId.entries()],
        ms: performance.now() - started,
      },
      transfer,
    );
  } catch {
    scope.postMessage({ times: { mode: "straight", origin: [0, 0] }, arrivals: [], originByBuildingId: [], ms: 0, failed: true });
  }
};
