import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import { squareBBox } from "../lib/geo";
import { demographicsMapSideWithPad } from "../lib/demographicsMapViewport";
import type { CityModel } from "../types";
import { buildParcelGeoIndex } from "../lib/demographicsParcelGeoIndex";
import { buildParcelIndex, type DemographicsParcelRecord } from "../lib/demographicsParcels";
import {
  fetchParcelsFromPmtiles,
  mergeParcelBounds,
} from "../lib/demographicsParcelsPmtiles";
import {
  DEMOGRAPHICS_RADIUS_MAX_M,
  type DemographicsExplorerState,
} from "../lib/demographicsExplorerReducer";
import { pinLonLat } from "../lib/demographicsExplorerPins";

type Bbox = { west: number; south: number; east: number; north: number };

function pinFetchBounds(state: DemographicsExplorerState): Bbox | null {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  const padM = DEMOGRAPHICS_RADIUS_MAX_M + 120;
  for (const pin of Object.values(state.pins)) {
    if (!pin) continue;
    const center = pinLonLat(pin);
    const dLat = padM / 111_132;
    const dLon = padM / (111_320 * Math.cos((center.lat * Math.PI) / 180));
    west = Math.min(west, center.lon - dLon);
    east = Math.max(east, center.lon + dLon);
    south = Math.min(south, center.lat - dLat);
    north = Math.max(north, center.lat + dLat);
  }
  if (!Number.isFinite(west)) return null;
  return { west, south, east, north };
}

function boundsKey(b: Bbox): string {
  return [b.west, b.south, b.east, b.north].map((v) => v.toFixed(5)).join("|");
}

function expandBounds(b: Bbox, padRatio = 0.08): Bbox {
  const dLon = (b.east - b.west) * padRatio;
  const dLat = (b.north - b.south) * padRatio;
  return {
    west: b.west - dLon,
    east: b.east + dLon,
    south: b.south - dLat,
    north: b.north + dLat,
  };
}

export function visibleBoundsFromMap(map: maplibregl.Map): Bbox {
  const b = map.getBounds();
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  return { west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat };
}

export function useDemographicsParcels(
  model: CityModel,
  state: DemographicsExplorerState,
  active: boolean,
  visibleBounds: Bbox | null,
) {
  const cacheRef = useRef(new Map<string, DemographicsParcelRecord>());
  const fetchedKeysRef = useRef(new Set<string>());
  const [cacheVersion, setCacheVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cutKey = `${model.center.lat},${model.center.lon},${model.sideM}`;

  const baseBounds = useMemo(() => {
    const cutB = squareBBox(model.center, demographicsMapSideWithPad(model.sideM));
    const pinB = pinFetchBounds(state);
    return pinB ? mergeParcelBounds(cutB, pinB) : cutB;
  }, [model.center, model.sideM, state.pins]);

  const targetBounds = useMemo(() => {
    if (!visibleBounds) return baseBounds;
    return mergeParcelBounds(baseBounds, expandBounds(visibleBounds));
  }, [baseBounds, visibleBounds]);

  const targetKey = boundsKey(targetBounds);

  const loadBounds = useCallback(async (bounds: Bbox, signal: AbortSignal) => {
    const key = boundsKey(bounds);
    if (fetchedKeysRef.current.has(key)) return;
    fetchedKeysRef.current.add(key);
    try {
      const loaded = await fetchParcelsFromPmtiles(bounds, signal);
      if (signal.aborted) return;
      let added = false;
      for (const parcel of loaded) {
        if (!cacheRef.current.has(parcel.id)) {
          cacheRef.current.set(parcel.id, parcel);
          added = true;
        }
      }
      if (added) setCacheVersion((v) => v + 1);
      setError(null);
    } catch (err: unknown) {
      if (signal.aborted) return;
      setError(err instanceof Error ? err.message : "Parcel load failed");
    }
  }, []);

  useEffect(() => {
    if (!active) {
      setLoading(false);
      return;
    }
    cacheRef.current.clear();
    fetchedKeysRef.current.clear();
    setCacheVersion(0);
    setLoading(true);
    const controller = new AbortController();
    void loadBounds(targetBounds, controller.signal).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [active, cutKey, loadBounds]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void loadBounds(targetBounds, controller.signal);
    return () => controller.abort();
  }, [active, loadBounds, targetKey]);

  const parcels = useMemo(() => {
    void cacheVersion;
    return [...cacheRef.current.values()];
  }, [cacheVersion]);

  const index = useMemo(
    () => (parcels.length ? buildParcelIndex(parcels, model.center) : null),
    [parcels, model.center],
  );

  const geoIndex = useMemo(() => buildParcelGeoIndex(parcels), [parcels]);

  return { parcels, index, geoIndex, loading, error };
}
