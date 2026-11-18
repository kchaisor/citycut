import { assessDirectSunHoursOverlay } from "./sunHoursDirectAssess";
import type { SunHoursDirectOverlay } from "./sunHoursDirectAssess";
import type { CityModel } from "../types";

export type SunHoursDirectWorkerRequest = {
  id: number;
  model: Pick<CityModel, "center" | "sideM" | "terrain" | "frameShape" | "buildings" | "trees">;
  year: number;
  month: number;
  day: number;
  scaleMaxHours?: number;
};

export type SunHoursDirectWorkerMessage =
  | { type: "done"; id: number; overlay: SunHoursDirectOverlay }
  | { type: "empty"; id: number };

type WorkerScope = {
  onmessage: ((event: MessageEvent<SunHoursDirectWorkerRequest>) => void) | null;
  postMessage: (message: SunHoursDirectWorkerMessage) => void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<SunHoursDirectWorkerRequest>) => {
  const { id, model, year, month, day, scaleMaxHours } = event.data;
  try {
    const overlay = assessDirectSunHoursOverlay(model as CityModel, year, month, day, scaleMaxHours);
    if (!overlay) scope.postMessage({ type: "empty", id });
    else scope.postMessage({ type: "done", id, overlay });
  } catch {
    scope.postMessage({ type: "empty", id });
  }
};
