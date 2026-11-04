import type { LineStyles } from "../lib/drawingStyle";
import type { PlanViewport } from "../lib/planViewport";
import type { CityModel } from "../types";
import type { DemographicsParcelIndex, DemographicsParcelRecord } from "../lib/demographicsParcels";
import type { DemographicsCatchmentStats } from "../lib/demographicsCatchment";
import type { DemographicsExplorerAction, DemographicsExplorerState } from "../lib/demographicsExplorerReducer";
import { DrawingPlan } from "./DrawingPlan";
import { DemographicsExplorerMap } from "./DemographicsExplorerMap";

export function DemographicsExplorerView({
  model,
  lineStyle,
  planScale,
  parcels,
  parcelIndex,
  state,
  dispatch,
  viewport,
  onViewportChange,
  fitCounter,
  statsA,
  statsB,
  onScale,
}: {
  model: CityModel;
  lineStyle: LineStyles;
  planScale: number;
  parcels: DemographicsParcelRecord[];
  parcelIndex: DemographicsParcelIndex | null;
  state: DemographicsExplorerState;
  dispatch: (action: DemographicsExplorerAction) => void;
  viewport: PlanViewport;
  onViewportChange: (view: PlanViewport) => void;
  fitCounter: number;
  statsA: DemographicsCatchmentStats | null;
  statsB: DemographicsCatchmentStats | null;
  onScale?: (widthM: number) => void;
}) {
  return (
    <div className="demographics-map-stack fill">
      <DrawingPlan
        model={model}
        kind="site"
        planRole="demographics-basemap"
        onScale={onScale}
        lineStyle={lineStyle}
        planScale={planScale}
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
        onViewportChange={onViewportChange}
        fitCounter={fitCounter}
        statsA={statsA}
        statsB={statsB}
      />
    </div>
  );
}
