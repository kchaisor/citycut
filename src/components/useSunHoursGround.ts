import { useEffect, useMemo, useRef, useState } from "react";
import type { SunHoursDirectOverlay } from "../lib/sunHoursDirectAssess";
import { rasterizeSunHoursRoofFromPacked } from "../lib/sunHoursRoofPlanRaster";
import type { SunHoursDirectWorkerMessage, SunHoursDirectWorkerRequest } from "../lib/sunHoursDirectAssess.worker";
import type { SunHoursGroundWorkerMessage, SunHoursGroundWorkerRequest } from "../lib/sunHoursGround.worker";
import type { SunHoursGroundGrid } from "../lib/sunHoursGroundPlan";
import {
  sunHoursQualityParams,
  sunHoursResolution,
  type SunHoursQualityParams,
  type SunHoursResolution,
} from "../lib/sunHoursQuality";
import type { RenderQuality } from "../lib/renderQuality";
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
  quality: RenderQuality,
): {
  grid: SunHoursGroundGrid | null;
  overlay: SunHoursDirectOverlay | null;
  scaleMaxHours: number;
  pending: boolean;
  pendingSurfaces: boolean;
  resolution: SunHoursResolution | null;
  targetResolution: SunHoursResolution | null;
} {
  const modelKey = useMemo(() => sunStudyModelKey(model), [model]);
  const [grid, setGrid] = useState<SunHoursGroundGrid | null>(null);
  const [overlay, setOverlay] = useState<SunHoursDirectOverlay | null>(null);
  const [scaleMaxHours, setScaleMaxHours] = useState(0);
  const [pending, setPending] = useState(false);
  const [pendingSurfaces, setPendingSurfaces] = useState(false);
  const [resolution, setResolution] = useState<SunHoursResolution | null>(null);
  const [targetResolution, setTargetResolution] = useState<SunHoursResolution | null>(null);
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
      document.documentElement.dataset.sunHoursGroundStepMinutes = String(nextGrid.stepMinutes);
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
      delete document.documentElement.dataset.sunHoursGroundStepMinutes;
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
      setResolution(null);
      setTargetResolution(null);
      publishReady(null, null);
      return;
    }
    const currentModel = modelRef.current;
    const params: SunHoursQualityParams = sunHoursQualityParams(quality, currentModel.sideM);
    const jobResolution = sunHoursResolution(params);
    const workerModel = {
      center: currentModel.center,
      sideM: currentModel.sideM,
      terrain: currentModel.terrain,
      frameShape: currentModel.frameShape,
      buildings: currentModel.buildings,
      trees: currentModel.trees,
    };
    let cancelled = false;
    const workers: Worker[] = [];
    const cancelMainThread: (() => void)[] = [];
    const finishGround = (nextGrid: SunHoursGroundGrid | null) => {
      if (cancelled) return;
      setGrid(nextGrid);
      setResolution(nextGrid ? jobResolution : null);
      setPending(false);
      if (!nextGrid) {
        setOverlay(null);
        setPendingSurfaces(false);
        publishReady(null, null);
        return;
      }
      publishReady(nextGrid, null);
      setPendingSurfaces(true);
      const scaleHint = nextGrid.maxSunHours;
      const settleSurfaces = (nextOverlay: SunHoursDirectOverlay | null) => {
        if (cancelled) return;
        let overlay = nextOverlay;
        if (overlay?.roofRasterSource && typeof document !== "undefined") {
          overlay = {
            ...overlay,
            roofPlanRaster: rasterizeSunHoursRoofFromPacked(
              currentModel,
              overlay.roofRasterSource,
              scaleHint || overlay.maxSunHours,
            ),
          };
        }
        setOverlay(overlay);
        publishReady(nextGrid, overlay);
        setPendingSurfaces(false);
      };
      const directWorker = startDirectWorker();
      if (!directWorker) {
        import("../lib/sunHoursDirectAssess").then(({ assessDirectSunHoursOverlay }) => {
          if (cancelled) return;
          settleSurfaces(assessDirectSunHoursOverlay(currentModel, year, month, day, scaleHint, params));
        });
        return;
      }
      workers.push(directWorker);
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
        model: workerModel,
        year,
        month,
        day,
        scaleMaxHours: scaleHint,
        params,
      };
      directWorker.postMessage(directRequest);
    };
    const runGroundOnMainThread = () => {
      const run = () => {
        if (cancelled) return;
        import("../lib/sunHoursGroundPlan").then(({ computeSunHoursGroundGrid }) => {
          if (cancelled) return;
          finishGround(computeSunHoursGroundGrid(currentModel, year, month, day, params.cellM, params.stepMinutes));
        });
      };
      if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
        const idleId = window.requestIdleCallback(run, { timeout: 4000 });
        cancelMainThread.push(() => window.cancelIdleCallback(idleId));
        return;
      }
      const timeoutId = setTimeout(run, 0);
      cancelMainThread.push(() => clearTimeout(timeoutId));
    };
    setPending(true);
    setTargetResolution(jobResolution);
    const groundWorker = startWorker();
    if (!groundWorker) {
      runGroundOnMainThread();
    } else {
      workers.push(groundWorker);
      const id = nextId++;
      groundWorker.onmessage = (event: MessageEvent<SunHoursGroundWorkerMessage>) => {
        const message = event.data;
        if (message.id !== id) return;
        if (message.type === "done") finishGround(message.grid);
        if (message.type === "empty") finishGround(null);
        groundWorker.terminate();
      };
      groundWorker.onerror = () => {
        groundWorker.terminate();
        runGroundOnMainThread();
      };
      const request: SunHoursGroundWorkerRequest = {
        id,
        model: workerModel,
        year,
        month,
        day,
        cellM: params.cellM,
        stepMinutes: params.stepMinutes,
      };
      groundWorker.postMessage(request);
    }
    return () => {
      cancelled = true;
      for (const worker of workers) worker.terminate();
      for (const cancel of cancelMainThread) cancel();
    };
  }, [enabled, modelKey, year, month, day, quality]);

  return { grid, overlay, scaleMaxHours, pending, pendingSurfaces, resolution, targetResolution };
}
