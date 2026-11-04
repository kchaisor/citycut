import { useEffect, useMemo, useState } from "react";
import { fromLocal, squareBBox } from "../lib/geo";
import { demographicsMapSideWithPad } from "../lib/demographicsMapViewport";
import type { CityModel } from "../types";
import { buildParcelIndex, type DemographicsParcelRecord } from "../lib/demographicsParcels";
import {
  fetchParcelsFromPmtiles,
  mergeParcelBounds,
} from "../lib/demographicsParcelsPmtiles";
import {
  DEMOGRAPHICS_RADIUS_MAX_M,
  type DemographicsExplorerState,
} from "../lib/demographicsExplorerReducer";

function pinBounds(model: CityModel, state: DemographicsExplorerState) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  const padM = DEMOGRAPHICS_RADIUS_MAX_M + 120;
  for (const pin of Object.values(state.pins)) {
    if (!pin) continue;
    const corners = [
      fromLocal([pin.east - padM, pin.north - padM], model.center),
      fromLocal([pin.east + padM, pin.north + padM], model.center),
    ];
    for (const c of corners) {
      west = Math.min(west, c.lon);
      east = Math.max(east, c.lon);
      south = Math.min(south, c.lat);
      north = Math.max(north, c.lat);
    }
  }
  if (!Number.isFinite(west)) return null;
  return { west, south, east, north };
}

export function useDemographicsParcels(
  model: CityModel,
  state: DemographicsExplorerState,
  active: boolean,
) {
  const [parcels, setParcels] = useState<DemographicsParcelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBounds = useMemo(() => {
    const cutB = squareBBox(model.center, demographicsMapSideWithPad(model.sideM));
    const pinB = pinBounds(model, state);
    return pinB ? mergeParcelBounds(cutB, pinB) : cutB;
  }, [model.center, model.sideM, state.pins]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    void fetchParcelsFromPmtiles(fetchBounds, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setParcels(loaded);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Parcel load failed");
        setLoading(false);
      });
    return () => controller.abort();
  }, [active, fetchBounds.east, fetchBounds.north, fetchBounds.south, fetchBounds.west]);

  const index = useMemo(
    () => (parcels.length ? buildParcelIndex(parcels, model.center) : null),
    [parcels, model.center],
  );

  return { parcels, index, loading, error };
}
