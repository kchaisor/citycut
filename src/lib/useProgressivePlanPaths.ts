import { useEffect, useMemo, useRef, useState } from "react";
import {
  beginBackgroundSmoothPlan,
  buildFastPlanPaths,
  buildSmoothPlanPaths,
  planModelCutToken,
  type PlanPathsRequest,
} from "./planPathsSession";
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
 */
export function useProgressivePlanPaths(request: PlanPathsRequest, enabled: boolean): PlanPaths {
  const syncPlan = useMemo(() => buildSmoothPlanPaths(request), requestDeps(request));

  const fastPlan = useMemo(
    () => (enabled ? buildFastPlanPaths(request) : syncPlan),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestDeps
    [enabled, ...requestDeps(request)],
  );

  const [smoothPlan, setSmoothPlan] = useState<PlanPaths | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setSmoothPlan(null);
      return;
    }
    generationRef.current += 1;
    const generation = generationRef.current;
    const token = planModelCutToken(request.model);
    setSmoothPlan(null);

    let cancelled = false;
    beginBackgroundSmoothPlan(request)
      .then((plan) => {
        if (cancelled) return;
        if (generationRef.current !== generation) return;
        if (planModelCutToken(request.model) !== token) return;
        setSmoothPlan(plan);
      })
      .catch(() => {
        /* keep fast plan visible */
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, ...requestDeps(request)]);

  if (!enabled) return fastPlan;
  return smoothPlan ?? fastPlan;
}
