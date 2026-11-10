import { planShadowSplitRings, type PlanShadowInput, type PlanShadowTreeMode } from "./buildingShadows";
import type { CityModel, Ring } from "../types";

export type SunStudyWorkerRequest = {
  id: number;
  model: Pick<CityModel, "sideM" | "terrain" | "frameShape" | "buildings" | "trees">;
  date: Omit<PlanShadowInput, "hour" | "minute">;
  hours: number[];
  treeMode?: PlanShadowTreeMode;
};

export type SunStudyWorkerMessage =
  | { type: "hour"; id: number; hour: number; rings: Ring[][]; addedRings: Ring[][] }
  | { type: "error"; id: number; hour: number; message: string };

type WorkerScope = {
  onmessage: ((event: MessageEvent<SunStudyWorkerRequest>) => void) | null;
  postMessage: (message: SunStudyWorkerMessage) => void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<SunStudyWorkerRequest>) => {
  const { id, model, date, hours, treeMode = "off" } = event.data;
  for (const hour of hours) {
    try {
      const split = planShadowSplitRings(model as CityModel, { ...date, hour, minute: 0 }, true, treeMode);
      scope.postMessage({
        type: "hour",
        id,
        hour,
        rings: [...split.existing],
        addedRings: [...split.added],
      });
    } catch (error) {
      scope.postMessage({ type: "error", id, hour, message: error instanceof Error ? error.message : String(error) });
    }
  }
};
