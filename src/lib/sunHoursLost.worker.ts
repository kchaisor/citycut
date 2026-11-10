import { computeSunHoursLostGrid } from "./sunHoursLostPlan";
import type { CityModel } from "../types";

export type SunHoursLostWorkerRequest = {
  id: number;
  model: Pick<CityModel, "center" | "sideM" | "terrain" | "frameShape" | "buildings">;
  year: number;
  cellM: number;
};

export type SunHoursLostWorkerMessage =
  | { type: "done"; id: number; grid: NonNullable<ReturnType<typeof computeSunHoursLostGrid>> }
  | { type: "empty"; id: number }
  | { type: "error"; id: number; message: string };

type WorkerScope = {
  onmessage: ((event: MessageEvent<SunHoursLostWorkerRequest>) => void) | null;
  postMessage: (message: SunHoursLostWorkerMessage) => void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<SunHoursLostWorkerRequest>) => {
  const { id, model, year, cellM } = event.data;
  try {
    const grid = computeSunHoursLostGrid(model as CityModel, year, cellM);
    if (!grid || grid.maxLoss < 0.01) scope.postMessage({ type: "empty", id });
    else scope.postMessage({ type: "done", id, grid });
  } catch (error) {
    scope.postMessage({
      type: "error",
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
