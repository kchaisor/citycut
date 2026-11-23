import { assessDirectSunHoursOverlay } from "./sunHoursDirectAssess";
import type { SunHoursDirectOverlay } from "./sunHoursDirectAssess";
import type { SunHoursSampleParams } from "./sunHoursQuality";
import { clampSunHoursProgress, createThrottledProgress } from "./sunHoursProgress";
import type { SunHoursWindow } from "./sunHoursWindow";
import type { CityModel } from "../types";

export type SunHoursDirectWorkerRequest = {
  id: number;
  model: Pick<CityModel, "center" | "sideM" | "widthM" | "heightM" | "terrain" | "frameShape" | "buildings" | "trees">;
  year: number;
  month: number;
  day: number;
  scaleMaxHours?: number;
  params: SunHoursSampleParams;
  window?: SunHoursWindow;
};

export type SunHoursDirectWorkerMessage =
  | { type: "progress"; id: number; fraction: number }
  | { type: "done"; id: number; overlay: SunHoursDirectOverlay }
  | { type: "empty"; id: number };

type WorkerScope = {
  onmessage: ((event: MessageEvent<SunHoursDirectWorkerRequest>) => void) | null;
  postMessage: (message: SunHoursDirectWorkerMessage) => void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<SunHoursDirectWorkerRequest>) => {
  const { id, model, year, month, day, scaleMaxHours, params, window } = event.data;
  try {
    const onProgress = createThrottledProgress((fraction) => {
      scope.postMessage({ type: "progress", id, fraction: clampSunHoursProgress(fraction) });
    });
    const overlay = assessDirectSunHoursOverlay(model as CityModel, year, month, day, scaleMaxHours, params, onProgress, window);
    if (!overlay) scope.postMessage({ type: "empty", id });
    else scope.postMessage({ type: "done", id, overlay });
  } catch {
    scope.postMessage({ type: "empty", id });
  }
};
