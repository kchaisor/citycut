import { useEffect, useMemo, useRef, useState } from "react";
import type { SunHoursDirectOverlay } from "../lib/sunHoursDirectAssess";
import type { SunHoursDirectWorkerMessage, SunHoursDirectWorkerRequest } from "../lib/sunHoursDirectAssess.worker";
import type { SunHoursGroundWorkerMessage, SunHoursGroundWorkerRequest } from "../lib/sunHoursGround.worker";
import type { PlanShadowTreeMode } from "../lib/buildingShadows";
import { SUN_HOURS_GROUND_CELL_M } from "../lib/sunHoursGround";
import type { SunHoursGroundGrid } from "../lib/sunHoursGroundPlan";
import { sunStudyModelKey } from "../lib/sunStudyPlan";
import type { CityModel } from "../types";

let nextId = 1;

function startWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("../lib/sunHoursGround.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

function startDirectWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("../lib/sunHoursDirectAssess.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

export function useSunHoursGround(
  model: CityModel,
  year: number,
  month: number,
  day: number,
  enabled: boolean,
  treeMode: PlanShadowTreeMode = "off",
): {
  grid: SunHoursGroundGrid | null;
  overlay: SunHoursDirectOverlay | null;
  scaleMaxHours: number;
  pending: boolean;
  pendingSurfaces: boolean;
} {
  const modelKey = useMemo(() => sunStudyModelKey(model), [model]);
  const [grid, setGrid] = useState<SunHoursGroundGrid | null>(null);
  const [overlay, setOverlay] = useState<SunHoursDirectOverlay | null>(null);
  const [scaleMaxHours, setScaleMaxHours] = useState(0);
  const [pending, setPending] = useState(false);
  const [pendingSurfaces, setPendingSurfaces] = useState(false);
  const modelRef = useRef(model);
  modelRef.current = model;

  function publishReady(nextGrid: SunHoursGroundGrid | null, nextOverlay: SunHoursDirectOverlay | null) {
    if (typeof document === "undefined") return;
    const groundMax = nextGrid?.maxSunHours ?? 0;
    const surfaceMax = nextOverlay?.maxSunHours ?? 0;
    const scale = Math.max(groundMax, surfaceMax);
    setScaleMaxHours(scale);
    if (nextGrid && scale > 0) {
      document.documentElement.dataset.sunHoursGroundReady = "1";
      document.documentElement.dataset.sunHoursGroundCellM = String(nextGrid.cellM);
      document.documentElement.dataset.sunHoursGroundMaxHours = String(scale);
      document.documentElement.dataset.sunHoursGroundSteps = String(nextGrid.steps);
      document.documentElement.dataset.sunHoursDirectSurfaces = String(nextOverlay?.cellCount ?? 0);
      if ((nextOverlay?.cellCount ?? 0) > 0) {
        document.documentElement.dataset.sunHoursDirectSurfacesReady = "1";
      } else {
        delete document.documentElement.dataset.sunHoursDirectSurfacesReady;
      }
    } else {
      delete document.documentElement.dataset.sunHoursGroundReady;
      delete document.documentElement.dataset.sunHoursGroundCellM;
      delete document.documentElement.dataset.sunHoursGroundMaxHours;
      delete document.documentElement.dataset.sunHoursGroundSteps;
      delete document.documentElement.dataset.sunHoursDirectSurfaces;
      delete document.documentElement.dataset.sunHoursDirectSurfacesReady;
    }
  }

  useEffect(() => {
    if (!enabled) {
      setGrid(null);
      setOverlay(null);
      setScaleMaxHours(0);
      setPending(false);
      setPendingSurfaces(false);
      publishReady(null, null);
      return;
    }
    const groundWorker = typeof document === "undefined" ? startWorker() : null;
    const currentModel = modelRef.current;
  const finishGround = (nextGrid: SunHoursGroundGrid | null) => {
      setGrid(nextGrid);
      setPending(false);
      if (!nextGrid) {
        setOverlay(null);
        publishReady(null, null);
        return;
      }
      publishReady(nextGrid, null);
      setPendingSurfaces(true);
      const scaleHint = nextGrid.maxSunHours;
      const settleSurfaces = (nextOverlay: SunHoursDirectOverlay | null) => {
        setOverlay(nextOverlay);
        publishReady(nextGrid, nextOverlay);
        setPendingSurfaces(false);
      };
      const directWorker = startDirectWorker();
      if (!directWorker) {
        import("../lib/sunHoursDirectAssess").then(({ assessDirectSunHoursOverlay }) => {
          settleSurfaces(assessDirectSunHoursOverlay(currentModel, year, month, day, scaleHint));
        });
        return;
      }
      const directId = nextId++;
      directWorker.onmessage = (event: MessageEvent<SunHoursDirectWorkerMessage>) => {
        const message = event.data;
        if (message.id !== directId) return;
        if (message.type === "done") settleSurfaces(message.overlay);
        if (message.type === "empty") settleSurfaces(null);
        directWorker.terminate();
      };
      directWorker.onerror = () => {
        settleSurfaces(null);
        directWorker.terminate();
      };
      const directRequest: SunHoursDirectWorkerRequest = {
        id: directId,
        model: {
          center: currentModel.center,
          sideM: currentModel.sideM,
          terrain: currentModel.terrain,
          frameShape: currentModel.frameShape,
          buildings: currentModel.buildings,
          trees: currentModel.trees,
        },
        year,
        month,
        day,
        scaleMaxHours: scaleHint,
      };
      directWorker.postMessage(directRequest);
    };
    setPending(true);
    if (!groundWorker) {
      let cancelled = false;
      const run = () => {
        if (cancelled) return;
        import("../lib/sunHoursGroundPlan").then(({ computeSunHoursGroundGrid }) => {
          if (cancelled) return;
          finishGround(computeSunHoursGroundGrid(currentModel, year, month, day, SUN_HOURS_GROUND_CELL_M, treeMode));
        });
      };
      if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
        const idleId = window.requestIdleCallback(run, { timeout: 4000 });
        return () => {
          cancelled = true;
          window.cancelIdleCallback(idleId);
        };
      }
      const timeoutId = window.setTimeout(run, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timeoutId);
      };
    }
    const id = nextId++;
    groundWorker.onmessage = (event: MessageEvent<SunHoursGroundWorkerMessage>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.type === "done") finishGround(message.grid);
      if (message.type === "empty") finishGround(null);
      groundWorker.terminate();
    };
    groundWorker.onerror = () => {
      setPending(false);
      groundWorker.terminate();
    };
    const request: SunHoursGroundWorkerRequest = {
      id,
      model: {
        center: currentModel.center,
        sideM: currentModel.sideM,
        terrain: currentModel.terrain,
        frameShape: currentModel.frameShape,
        buildings: currentModel.buildings,
        trees: currentModel.trees,
      },
      year,
      month,
      day,
      cellM: SUN_HOURS_GROUND_CELL_M,
      treeMode,
    };
    groundWorker.postMessage(request);
    return () => groundWorker.terminate();
  }, [enabled, modelKey, treeMode, year, month, day]);

  return { grid, overlay, scaleMaxHours, pending, pendingSurfaces };
}
