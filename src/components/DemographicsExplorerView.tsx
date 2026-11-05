import { useCallback, useState } from "react";
import type maplibregl from "maplibre-gl";
import type { CityModel } from "../types";
import type { DemographicsParcelGeoIndex } from "../lib/demographicsParcelGeoIndex";
import type { DemographicsCatchmentStats } from "../lib/demographicsCatchment";
import type { DemographicsExplorerAction, DemographicsExplorerState, DemographicsPinId } from "../lib/demographicsExplorerReducer";
import type { LonLat } from "../types";
import { DemographicsExplorerBasemap } from "./DemographicsExplorerBasemap";
import { DemographicsExplorerMap } from "./DemographicsExplorerMap";
import { visibleBoundsFromMap } from "./useDemographicsParcels";

export function DemographicsExplorerView({
  model,
  geoIndex,
  parcelCount,
  state,
  dispatch,
  fitCounter,
  statsA,
  statsB,
  onLivePins,
  onVisibleBounds,
}: {
  model: CityModel;
  geoIndex: DemographicsParcelGeoIndex | null;
  parcelCount: number;
  state: DemographicsExplorerState;
  dispatch: (action: DemographicsExplorerAction) => void;
  fitCounter: number;
  statsA: DemographicsCatchmentStats | null;
  statsB: DemographicsCatchmentStats | null;
  onLivePins: (pins: Partial<Record<DemographicsPinId, LonLat>>) => void;
  onVisibleBounds: (bounds: ReturnType<typeof visibleBoundsFromMap>) => void;
}) {
  const [map, setMap] = useState<maplibregl.Map | null>(null);

  const onMapReady = useCallback(
    (next: maplibregl.Map) => {
      setMap(next);
      onVisibleBounds(visibleBoundsFromMap(next));
    },
    [onVisibleBounds],
  );

  const handleVisibleBounds = useCallback(
    (bounds: ReturnType<typeof visibleBoundsFromMap>) => {
      onVisibleBounds(bounds);
    },
    [onVisibleBounds],
  );

  return (
    <div className="demographics-map-stack fill">
      <DemographicsExplorerBasemap
        model={model}
        fitCounter={fitCounter}
        radiusM={state.radiusM}
        onMapReady={onMapReady}
        onVisibleBounds={handleVisibleBounds}
      />
      {map && (
        <DemographicsExplorerMap
          map={map}
          geoIndex={geoIndex}
          parcelCount={parcelCount}
          state={state}
          dispatch={dispatch}
          statsA={statsA}
          statsB={statsB}
          onLivePins={onLivePins}
        />
      )}
    </div>
  );
}
