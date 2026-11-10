import { useEffect, useMemo, useState } from "react";
import type { SolarReceptorWorkerMessage, SolarReceptorWorkerRequest } from "../lib/solarReceptorAssess.worker";
import { sunStudyModelKey } from "../lib/sunStudyPlan";
import type { SolarReceptorArea, SolarReceptorAssessResult } from "../lib/solarReceptorAssess";
import type { CityModel } from "../types";

let nextId = 1;

function startWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("../lib/solarReceptorAssess.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

export function useSolarReceptorAssess(
  model: CityModel,
  receptors: readonly SolarReceptorArea[],
  year: number,
  enabled: boolean,
): { results: SolarReceptorAssessResult[]; pending: boolean } {
  const modelKey = useMemo(() => sunStudyModelKey(model), [model]);
  const receptorKey = useMemo(
    () => receptors.map((receptor) => `${receptor.id}:${receptor.ring.map((p) => p.join(",")).join(";")}`).join("|"),
    [receptors],
  );
  const [results, setResults] = useState<SolarReceptorAssessResult[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!enabled || receptors.length === 0) {
      setResults([]);
      setPending(false);
      return;
    }
    const worker = startWorker();
    if (!worker) {
      import("../lib/solarReceptorAssess").then(({ assessSolarReceptors }) => {
        setResults(assessSolarReceptors(model, receptors, year));
        setPending(false);
      });
      return;
    }
    setPending(true);
    const id = nextId++;
    worker.onmessage = (event: MessageEvent<SolarReceptorWorkerMessage>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.type === "done") setResults(message.results);
      setPending(false);
      worker.terminate();
    };
    worker.onerror = () => {
      setPending(false);
      worker.terminate();
    };
    const request: SolarReceptorWorkerRequest = {
      id,
      model: {
        center: model.center,
        sideM: model.sideM,
        terrain: model.terrain,
        frameShape: model.frameShape,
        buildings: model.buildings,
      },
      receptors: [...receptors],
      year,
    };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [enabled, model, modelKey, receptorKey, receptors, year]);

  return { results, pending };
}
