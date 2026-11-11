import { useEffect, useMemo, useRef, useState } from "react";
import type { FacadeSolarWorkerMessage, FacadeSolarWorkerRequest } from "../lib/facadeSolarAssess.worker";
import { sunStudyModelKey } from "../lib/sunStudyPlan";
import type { FacadeAssessBundle } from "../lib/facadeSolarTypes";
import type { CityModel } from "../types";

let nextId = 1;

function startWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("../lib/facadeSolarAssess.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

export function useFacadeSolarAssess(
  model: CityModel,
  year: number,
  enabled: boolean,
): { bundle: FacadeAssessBundle | null; pending: boolean } {
  const modelKey = useMemo(() => sunStudyModelKey(model), [model]);
  const [bundle, setBundle] = useState<FacadeAssessBundle | null>(null);
  const [pending, setPending] = useState(false);
  const modelRef = useRef(model);
  modelRef.current = model;

  useEffect(() => {
    if (!enabled) {
      setBundle(null);
      setPending(false);
      return;
    }
    const worker = startWorker();
    const currentModel = modelRef.current;
    if (!worker) {
      import("../lib/facadeSolarAssess").then(({ assessFacadeSolar }) => {
        setBundle(assessFacadeSolar(currentModel, currentModel.center.lat, currentModel.center.lon, year));
        setPending(false);
      });
      return;
    }
    setPending(true);
    const id = nextId++;
    const settleMainThread = () => {
      import("../lib/facadeSolarAssess").then(({ assessFacadeSolar }) => {
        const live = modelRef.current;
        setBundle(assessFacadeSolar(live, live.center.lat, live.center.lon, year));
        setPending(false);
      });
    };
    worker.onmessage = (event: MessageEvent<FacadeSolarWorkerMessage>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.type === "done") {
        setBundle(message.result);
        setPending(false);
        worker.terminate();
        return;
      }
      worker.terminate();
      settleMainThread();
    };
    worker.onerror = () => {
      worker.terminate();
      settleMainThread();
    };
    const request: FacadeSolarWorkerRequest = {
      id,
      model: {
        center: currentModel.center,
        sideM: currentModel.sideM,
        terrain: currentModel.terrain,
        frameShape: currentModel.frameShape,
        buildings: currentModel.buildings,
      },
      year,
    };
    worker.postMessage(request);
    return () => worker.terminate();
  }, [enabled, modelKey, year]);

  return { bundle, pending };
}
