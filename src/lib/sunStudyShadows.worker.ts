import { planShadowRings, type PlanShadowInput } from "./buildingShadows";
import type { CityModel, Ring } from "../types";

export type SunStudyWorkerRequest = {
  id: number;
  model: Pick<CityModel, "sideM" | "terrain" | "frameShape" | "buildings">;
  date: Omit<PlanShadowInput, "hour" | "minute">;
  hours: number[];
};

export type SunStudyWorkerMessage =
  | { type: "hour"; id: number; hour: number; rings: Ring[][] }
  | { type: "error"; id: number; hour: number; message: string };

type WorkerScope = {
  onmessage: ((event: MessageEvent<SunStudyWorkerRequest>) => void) | null;
  postMessage: (message: SunStudyWorkerMessage) => void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<SunStudyWorkerRequest>) => {
  const { id, model, date, hours } = event.data;
  for (const hour of hours) {
    try {
      const rings = planShadowRings(model as CityModel, { ...date, hour, minute: 0 }, true);
      scope.postMessage({ type: "hour", id, hour, rings: [...rings] });
    } catch (error) {
      scope.postMessage({ type: "error", id, hour, message: error instanceof Error ? error.message : String(error) });
    }
  }
};
