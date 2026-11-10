import { useEffect, useMemo, useRef, useState } from "react";
import type { SunHoursLostWorkerMessage, SunHoursLostWorkerRequest } from "../lib/sunHoursLost.worker";
import { proposedMassingInModel } from "../lib/buildingShadows";
import { SUN_HOURS_LOST_CELL_M } from "../lib/sunHoursLost";
import type { SunHoursLostGrid } from "../lib/sunHoursLostPlan";
import { sunStudyModelKey } from "../lib/sunStudyPlan";
import type { CityModel } from "../types";

let nextId = 1;

function startWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("../lib/sunHoursLost.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

export function useSunHoursLostPlan(
  model: CityModel,
  year: number,
  enabled: boolean,
): { grid: SunHoursLostGrid | null; pending: boolean } {
  const modelKey = useMemo(() => sunStudyModelKey(model), [model]);
  const hasProposal = useMemo(() => proposedMassingInModel(model), [model]);
  const [grid, setGrid] = useState<SunHoursLostGrid | null>(null);
  const [pending, setPending] = useState(false);
  const modelRef = useRef(model);
  modelRef.current = model;

  useEffect(() => {
    if (!enabled || !hasProposal) {
      setGrid(null);
      setPending(false);
      return;
    }
    const worker = startWorker();
    const currentModel = modelRef.current;
    if (!worker) {
      import("../lib/sunHoursLostPlan").then(({ computeSunHoursLostGrid }) => {
        setGrid(computeSunHoursLostGrid(currentModel, year, SUN_HOURS_LOST_CELL_M));
        setPending(false);
      });
      return;
    }
    setPending(true);
    const id = nextId++;
    worker.onmessage = (event: MessageEvent<SunHoursLostWorkerMessage>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.type === "done") setGrid(message.grid);
      if (message.type === "empty") setGrid(null);
      setPending(false);
      worker.terminate();
    };
    worker.onerror = () => {
      setPending(false);
      worker.terminate();
    };
    const request: SunHoursLostWorkerRequest = {
      id,
      model: {
        center: currentModel.center,
        sideM: currentModel.sideM,
        terrain: currentModel.terrain,
        frameShape: currentModel.frameShape,
        buildings: currentModel.buildings,
      },
      year,
      cellM: SUN_HOURS_LOST_CELL_M,
    };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [enabled, hasProposal, modelKey, year]);

  return { grid, pending };
}
