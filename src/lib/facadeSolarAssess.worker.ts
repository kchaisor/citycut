import { assessFacadeSolar } from "./facadeSolarAssess";
import type { FacadeAssessBundle } from "./facadeSolarTypes";
import type { CityModel } from "../types";

export type FacadeSolarWorkerRequest = {
  id: number;
  model: Pick<CityModel, "center" | "sideM" | "terrain" | "frameShape" | "buildings">;
  year: number;
};

export type FacadeSolarWorkerMessage =
  | { type: "done"; id: number; result: FacadeAssessBundle }
  | { type: "error"; id: number; message: string };

type WorkerScope = {
  onmessage: ((event: MessageEvent<FacadeSolarWorkerRequest>) => void) | null;
  postMessage: (message: FacadeSolarWorkerMessage) => void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<FacadeSolarWorkerRequest>) => {
  const { id, model, year } = event.data;
  try {
    const lat = model.center.lat;
    const lon = model.center.lon;
    const result = assessFacadeSolar(model as CityModel, lat, lon, year);
    scope.postMessage({ type: "done", id, result });
  } catch (error) {
    scope.postMessage({
      type: "error",
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
