import { useEffect, useMemo, useRef, useState } from "react";
import {
  beginBackgroundSmoothPlan,
  buildFastPlanPaths,
  buildSmoothPlanPaths,
  planSmoothGeometryKey,
  withColourSnapshot,
  type PlanPathsRequest,
} from "./planPathsSession";
import { SupersededSmoothPlanJob } from "./smoothPlanWorkerClient";
import type { PlanPaths } from "./svgPlan";

const requestDeps = (request: PlanPathsRequest) => {
  const colour = request.planOptions?.buildingColour;
  return [
    request.model,
    request.pathWidthM,
    request.contourIndexEvery,
    request.planScale,
    request.coarseIntervalM,
    request.coarseFromScale,
    request.planOptions?.pathFilletM,
    request.planOptions?.highlightManual,
    colour?.colourByUse,
    colour?.uniformBuildings,
    colour?.colourBySource,
  ];
};

/**
 * Site plan: main-speed coarse fills first, then swap to smooth fills in one React update.
 * Smooth geometry is never built synchronously while progressive mode is on.
 */
export function useProgressivePlanPaths(request: PlanPathsRequest, enabled: boolean): PlanPaths {
  const fastPlan = useMemo(() => buildFastPlanPaths(request), requestDeps(request));

  const syncSmoothPlan = useMemo(() => {
    if (enabled) return null;
    return buildSmoothPlanPaths(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestDeps
  }, [enabled, ...requestDeps(request)]);

  const [smoothPlan, setSmoothPlan] = useState<PlanPaths | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setSmoothPlan(null);
      return;
    }
    generationRef.current += 1;
    const generation = generationRef.current;
    const geometryKey = planSmoothGeometryKey(withColourSnapshot(request));
    setSmoothPlan(null);

    let cancelled = false;
    const applySmooth = (plan: PlanPaths) => {
      if (cancelled) return;
      if (generationRef.current !== generation) return;
      if (planSmoothGeometryKey(withColourSnapshot(request)) !== geometryKey) return;
      setSmoothPlan(plan);
    };
    const runDisplaySmooth = () => {
      beginBackgroundSmoothPlan(request)
        .then(applySmooth)
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof SupersededSmoothPlanJob && generationRef.current === generation) {
            runDisplaySmooth();
          }
        });
    };
    runDisplaySmooth();

    return () => {
      cancelled = true;
    };
  }, [enabled, ...requestDeps(request)]);

  if (!enabled) return syncSmoothPlan ?? fastPlan;
  return smoothPlan ?? fastPlan;
}
