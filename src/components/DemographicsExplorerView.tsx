import { useCallback, useState } from "react";
import { demographicsPlanViewportExtent, type PlanViewport } from "../lib/planViewport";
import type { CityModel } from "../types";
import type { DemographicsParcelIndex, DemographicsParcelRecord } from "../lib/demographicsParcels";
import type { DemographicsCatchmentStats } from "../lib/demographicsCatchment";
import type { DemographicsExplorerAction, DemographicsExplorerState } from "../lib/demographicsExplorerReducer";
import { DemographicsExplorerBasemap } from "./DemographicsExplorerBasemap";
import { DemographicsExplorerMap } from "./DemographicsExplorerMap";

export function DemographicsExplorerView({
  model,
  parcels,
  parcelIndex,
  state,
  dispatch,
  fitCounter,
  statsA,
  statsB,
}: {
  model: CityModel;
  parcels: DemographicsParcelRecord[];
  parcelIndex: DemographicsParcelIndex | null;
  state: DemographicsExplorerState;
  dispatch: (action: DemographicsExplorerAction) => void;
  fitCounter: number;
  statsA: DemographicsCatchmentStats | null;
  statsB: DemographicsCatchmentStats | null;
}) {
  const [overlayViewport, setOverlayViewport] = useState<PlanViewport>(() =>
    demographicsPlanViewportExtent(model.sideM),
  );
  const onOverlayViewport = useCallback((view: PlanViewport) => {
    setOverlayViewport(view);
  }, []);

  return (
    <div className="demographics-map-stack fill">
      <DemographicsExplorerBasemap
        model={model}
        fitCounter={fitCounter}
        radiusM={state.radiusM}
        onOverlayViewport={onOverlayViewport}
      />
      <DemographicsExplorerMap
        model={model}
        parcels={parcels}
        parcelIndex={parcelIndex}
        state={state}
        dispatch={dispatch}
        viewport={overlayViewport}
        fitCounter={fitCounter}
        statsA={statsA}
        statsB={statsB}
      />
    </div>
  );
}
