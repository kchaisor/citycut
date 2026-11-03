import { useEffect, useMemo, useState } from "react";
import { fromLocal, squareBBox, toLocal } from "../lib/geo";
import type { CityModel } from "../types";
import type { PlanViewport } from "../lib/planViewport";
import { buildParcelIndex, type DemographicsParcelRecord } from "../lib/demographicsParcels";
import {
  fetchParcelsFromPmtiles,
  mergeParcelBounds,
} from "../lib/demographicsParcelsPmtiles";
import type { DemographicsExplorerState } from "../lib/demographicsExplorerReducer";

function viewBoundsFromViewport(model: CityModel, view: PlanViewport) {
  const sw = fromLocal([view.x, view.y + view.h], model.center);
  const ne = fromLocal([view.x + view.w, view.y], model.center);
  return {
    south: Math.min(sw.lat, ne.lat),
    north: Math.max(sw.lat, ne.lat),
    west: Math.min(sw.lon, ne.lon),
    east: Math.max(sw.lon, ne.lon),
  };
}

function pinBounds(model: CityModel, state: DemographicsExplorerState) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  const padM = state.radiusM + 120;
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
  view: PlanViewport,
  state: DemographicsExplorerState,
  active: boolean,
) {
  const [parcels, setParcels] = useState<DemographicsParcelRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBounds = useMemo(() => {
    const viewB = viewBoundsFromViewport(model, view);
    const pinB = pinBounds(model, state);
    const cutB = squareBBox(model.center, model.sideM + state.radiusM * 2);
    let merged = mergeParcelBounds(viewB, cutB);
    if (pinB) merged = mergeParcelBounds(merged, pinB);
    return merged;
  }, [model, state.pins, state.radiusM, view.h, view.w, view.x, view.y]);

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

export function lonLatPinToLocal(
  model: CityModel,
  lon: number,
  lat: number,
): { east: number; north: number } {
  const [east, north] = toLocal(lat, lon, model.center);
  return { east, north };
}
