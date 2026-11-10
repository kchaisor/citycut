import { useEffect, useMemo, useRef, useState } from "react";
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
  const modelRef = useRef(model);
  const receptorsRef = useRef(receptors);
  modelRef.current = model;
  receptorsRef.current = receptors;

  useEffect(() => {
    if (!enabled || receptorsRef.current.length === 0) {
      setResults([]);
      setPending(false);
      return;
    }
    const worker = startWorker();
    const currentModel = modelRef.current;
    const currentReceptors = receptorsRef.current;
    if (!worker) {
      import("../lib/solarReceptorAssess").then(({ assessSolarReceptors }) => {
        setResults(assessSolarReceptors(currentModel, currentReceptors, year));
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
        center: currentModel.center,
        sideM: currentModel.sideM,
        terrain: currentModel.terrain,
        frameShape: currentModel.frameShape,
        buildings: currentModel.buildings,
      },
      receptors: [...currentReceptors],
      year,
    };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [enabled, modelKey, receptorKey, year]);

  return { results, pending };
}
