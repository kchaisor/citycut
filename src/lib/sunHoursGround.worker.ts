import type { PlanShadowTreeMode } from "./buildingShadows";
import { computeSunHoursGroundGrid } from "./sunHoursGroundPlan";
import type { CityModel } from "../types";

export type SunHoursGroundWorkerRequest = {
  id: number;
  model: Pick<CityModel, "center" | "sideM" | "terrain" | "frameShape" | "buildings" | "trees">;
  year: number;
  month: number;
  day: number;
  cellM: number;
  treeMode: PlanShadowTreeMode;
};

export type SunHoursGroundWorkerMessage =
  | { type: "done"; id: number; grid: NonNullable<ReturnType<typeof computeSunHoursGroundGrid>> }
  | { type: "empty"; id: number };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SunHoursGroundWorkerRequest>) => void) | null;
  postMessage: (message: SunHoursGroundWorkerMessage) => void;
};

scope.onmessage = (event: MessageEvent<SunHoursGroundWorkerRequest>) => {
  const { id, model, year, month, day, cellM, treeMode } = event.data;
  try {
    const grid = computeSunHoursGroundGrid(model as CityModel, year, month, day, cellM, treeMode);
    if (!grid) scope.postMessage({ type: "empty", id });
    else scope.postMessage({ type: "done", id, grid });
  } catch {
    scope.postMessage({ type: "empty", id });
  }
};
