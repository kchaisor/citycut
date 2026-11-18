import { assessSolarReceptors, type SolarReceptorArea } from "./solarReceptorAssess";
import type { CityModel } from "../types";

export type SolarReceptorWorkerRequest = {
  id: number;
  model: Pick<CityModel, "center" | "sideM" | "terrain" | "frameShape" | "buildings">;
  receptors: SolarReceptorArea[];
  year: number;
};

export type SolarReceptorWorkerMessage =
  | { type: "done"; id: number; results: ReturnType<typeof assessSolarReceptors> }
  | { type: "error"; id: number; message: string };

type WorkerScope = {
  onmessage: ((event: MessageEvent<SolarReceptorWorkerRequest>) => void) | null;
  postMessage: (message: SolarReceptorWorkerMessage) => void;
};

const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<SolarReceptorWorkerRequest>) => {
  const { id, model, receptors, year } = event.data;
  try {
    const results = assessSolarReceptors(model as CityModel, receptors, year);
    scope.postMessage({ type: "done", id, results });
  } catch (error) {
    scope.postMessage({
      type: "error",
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
