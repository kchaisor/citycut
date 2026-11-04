import type { PlanViewport } from "../lib/planViewport";
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
  viewport,
  onViewportChange,
  fitCounter,
  statsA,
  statsB,
}: {
  model: CityModel;
  parcels: DemographicsParcelRecord[];
  parcelIndex: DemographicsParcelIndex | null;
  state: DemographicsExplorerState;
  dispatch: (action: DemographicsExplorerAction) => void;
  viewport: PlanViewport;
  onViewportChange: (view: PlanViewport) => void;
  fitCounter: number;
  statsA: DemographicsCatchmentStats | null;
  statsB: DemographicsCatchmentStats | null;
}) {
  return (
    <div className="demographics-map-stack fill">
      <DemographicsExplorerBasemap
        model={model}
        viewport={viewport}
        onViewportChange={onViewportChange}
        fitCounter={fitCounter}
      />
      <DemographicsExplorerMap
        model={model}
        parcels={parcels}
        parcelIndex={parcelIndex}
        state={state}
        dispatch={dispatch}
        viewport={viewport}
        fitCounter={fitCounter}
        statsA={statsA}
        statsB={statsB}
      />
    </div>
  );
}
