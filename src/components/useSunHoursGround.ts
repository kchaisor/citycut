import { useEffect, useMemo, useRef, useState } from "react";
import type { SunHoursDirectOverlay } from "../lib/sunHoursDirectAssess";
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
    } else {
      delete document.documentElement.dataset.sunHoursGroundReady;
      delete document.documentElement.dataset.sunHoursGroundCellM;
      delete document.documentElement.dataset.sunHoursGroundMaxHours;
      delete document.documentElement.dataset.sunHoursGroundSteps;
      delete document.documentElement.dataset.sunHoursDirectSurfaces;
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
    const worker = startWorker();
    const currentModel = modelRef.current;
  const finishGround = (nextGrid: SunHoursGroundGrid | null) => {
      setGrid(nextGrid);
      setPending(false);
      if (!nextGrid) {
        setOverlay(null);
        publishReady(null, null);
        return;
      }
      setPendingSurfaces(true);
      import("../lib/sunHoursDirectAssess").then(({ assessDirectSunHoursOverlay }) => {
        const nextOverlay = assessDirectSunHoursOverlay(currentModel, year, month, day, nextGrid.maxSunHours);
        setOverlay(nextOverlay);
        publishReady(nextGrid, nextOverlay);
        setPendingSurfaces(false);
      });
    };
    if (!worker) {
      setPending(true);
      import("../lib/sunHoursGroundPlan").then(({ computeSunHoursGroundGrid }) => {
        finishGround(computeSunHoursGroundGrid(currentModel, year, month, day, SUN_HOURS_GROUND_CELL_M, treeMode));
      });
      return;
    }
    setPending(true);
    const id = nextId++;
    worker.onmessage = (event: MessageEvent<SunHoursGroundWorkerMessage>) => {
      const message = event.data;
      if (message.id !== id) return;
      if (message.type === "done") finishGround(message.grid);
      if (message.type === "empty") finishGround(null);
      worker.terminate();
    };
    worker.onerror = () => {
      setPending(false);
      worker.terminate();
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
    worker.postMessage(request);
    return () => worker.terminate();
  }, [enabled, modelKey, treeMode, year, month, day]);

  return { grid, overlay, scaleMaxHours, pending, pendingSurfaces };
}
