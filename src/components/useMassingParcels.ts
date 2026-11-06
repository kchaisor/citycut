import * as THREE from "three";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MultiPolygon } from "polygon-clipping";
import type RBush from "rbush";
import type { CityModel } from "../types";
import { getColour } from "../lib/colours";
import { squareBBox } from "../lib/geo";
import {
  nearestParcelIds,
  pickParcelAt,
  pointInLocalMulti,
  unionParcelsLocal,
} from "../lib/massingParcelBoundary";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import {
  buildMassingParcelOutlineBundle,
  buildMassingParcelSelectionBundle,
  buildMassingSiteBoundaryBundle,
  buildParcelOutlineIndex,
  fetchParcelOutlinesForCut,
  mergeMassingParcelBundles,
  searchParcelOutlines,
  type IndexedParcel,
  type ParcelOutline,
} from "../lib/parcelOutlines";

declare global {
  interface Window {
    __citycutQaParcels?: {
      count: number;
      segments: number;
      status: "loading" | "ready" | "error";
      selectedIds?: string[];
      boundaryPolygons?: number;
      source?: "pmtiles" | "vicmap" | "pmtiles+vicmap";
    };
  }
}

export type MassingParcelApi = {
  status: "loading" | "ready" | "error";
  parcelCount: number;
  segmentCount: number;
  selectedIds: string[];
  boundary: MultiPolygon;
  toggleParcel: (id: string) => void;
  selectParcels: (ids: string[]) => void;
  clearSelection: () => void;
  pickAt: (east: number, north: number) => string | null;
  nearestIds: (count: number) => string[];
  pointAllowed: (east: number, north: number) => boolean;
  outlineObjects: THREE.Object3D[];
  outlineLineMaterials: LineMaterial[];
  parcelSource: "pmtiles" | "vicmap" | "pmtiles+vicmap" | null;
  getSyncState: () => { selectedIds: string[]; boundaryPolygons: number };
  sampleInsideBoundary: () => [number, number] | null;
};

export function useMassingParcels(model: CityModel, massingEnabled: boolean): MassingParcelApi {
  const [parcels, setParcels] = useState<ParcelOutline[] | null>(null);
  const [index, setIndex] = useState<RBush<IndexedParcel> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [boundary, setBoundary] = useState<MultiPolygon>([]);
  const [parcelSource, setParcelSource] = useState<"pmtiles" | "vicmap" | "pmtiles+vicmap" | null>(null);
  const cutKey = `${model.center.lat},${model.center.lon},${model.sideM}`;
  const parcelsByIdRef = useRef(new Map<string, ParcelOutline>());
  const syncSelectionRef = useRef<{ selectedIds: string[]; boundary: MultiPolygon }>({
    selectedIds: [],
    boundary: [],
  });

  useEffect(() => {
    if (!massingEnabled) return;
    const controller = new AbortController();
    setStatus("loading");
    setParcels(null);
    setIndex(null);
    const bounds = squareBBox(model.center, model.sideM);
    fetchParcelOutlinesForCut(model, bounds, controller.signal)
      .then(({ parcels: loaded, source }) => {
        if (controller.signal.aborted) return;
        const tree = buildParcelOutlineIndex(loaded);
        const inCut = searchParcelOutlines(tree, bounds);
        setParcels(inCut);
        setIndex(tree);
        setParcelSource(source);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [cutKey, massingEnabled, model.center, model.sideM]);

  useEffect(() => {
    const map = new Map<string, ParcelOutline>();
    for (const parcel of parcels ?? []) map.set(parcel.id, parcel);
    parcelsByIdRef.current = map;
  }, [parcels]);

  const applySelection = useCallback(
    (ids: string[]) => {
      const unique = [...new Set(ids)];
      const selected = unique
        .map((id) => parcelsByIdRef.current.get(id))
        .filter((parcel): parcel is ParcelOutline => parcel != null);
      const nextBoundary = selected.length ? unionParcelsLocal(selected, model.center) : [];
      syncSelectionRef.current = { selectedIds: unique, boundary: nextBoundary };
      setSelectedIds(unique);
      setBoundary(nextBoundary);
    },
    [model.center],
  );

  useEffect(() => {
    if (!massingEnabled) applySelection([]);
  }, [applySelection, massingEnabled, cutKey]);

  const selectedParcels = useMemo(
    () => selectedIds.map((id) => parcelsByIdRef.current.get(id)).filter((p): p is ParcelOutline => p != null),
    [selectedIds, parcels],
  );

  const toggleParcel = useCallback(
    (id: string) => {
      const prev = syncSelectionRef.current.selectedIds;
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      applySelection(next);
    },
    [applySelection],
  );

  const selectParcels = useCallback((ids: string[]) => applySelection(ids), [applySelection]);

  const clearSelection = useCallback(() => applySelection([]), [applySelection]);

  const pickAt = useCallback(
    (east: number, north: number) => {
      if (!index) return null;
      return pickParcelAt(index, east, north, model.center);
    },
    [index, model.center],
  );

  const nearestIds = useCallback(
    (count: number) => nearestParcelIds(parcels ?? [], model.center, count),
    [model.center, parcels],
  );

  const pointAllowed = useCallback((east: number, north: number) => {
    const active = syncSelectionRef.current.boundary;
    if (!active.length) return true;
    return pointInLocalMulti([east, north], active);
  }, []);

  const getSyncState = useCallback(
    () => ({
      selectedIds: syncSelectionRef.current.selectedIds,
      boundaryPolygons: syncSelectionRef.current.boundary.length,
    }),
    [],
  );

  const sampleInsideBoundary = useCallback((): [number, number] | null => {
    const active = syncSelectionRef.current.boundary;
    if (!active.length) return [0, 0];
    const outer = active[0]?.[0];
    if (!outer?.length) return null;
    let cx = 0;
    let cy = 0;
    const ring = outer.slice(0, -1);
    for (const [x, y] of ring) {
      cx += x;
      cy += y;
    }
    const n = ring.length || 1;
    return [cx / n, cy / n];
  }, []);

  const outlineBundle = useMemo(() => {
    if (!parcels?.length) return { objects: [], lineMaterials: [], segmentCount: 0 };
    const parts = [buildMassingParcelOutlineBundle(model, parcels, getColour("--parcel-outline"))];
    if (selectedParcels.length) {
      parts.push(
        buildMassingParcelSelectionBundle(
          model,
          selectedParcels,
          getColour("--parcel-outline-selected"),
          getColour("--parcel-fill-selected"),
        ),
      );
    }
    if (boundary.length) {
      parts.push(
        buildMassingSiteBoundaryBundle(
          model,
          boundary,
          getColour("--parcel-boundary-active"),
          getColour("--parcel-fill-boundary"),
        ),
      );
    }
    return mergeMassingParcelBundles(...parts);
  }, [boundary, model, parcels, selectedParcels]);

  const outlineObjects = outlineBundle.objects;
  const outlineLineMaterials = outlineBundle.lineMaterials;
  const segmentCount = outlineBundle.segmentCount;

  useEffect(() => {
    if (typeof window === "undefined" || !massingEnabled) {
      delete window.__citycutQaParcels;
      return;
    }
    window.__citycutQaParcels = {
      count: parcels?.length ?? 0,
      segments: segmentCount,
      status,
      selectedIds,
      boundaryPolygons: boundary.length,
      source: parcelSource ?? undefined,
    };
  }, [boundary.length, massingEnabled, parcelSource, parcels?.length, segmentCount, selectedIds, status]);

  return {
    status,
    parcelCount: parcels?.length ?? 0,
    segmentCount,
    selectedIds,
    boundary,
    toggleParcel,
    selectParcels,
    clearSelection,
    pickAt,
    nearestIds,
    pointAllowed,
    outlineObjects,
    outlineLineMaterials,
    parcelSource,
    getSyncState,
    sampleInsideBoundary,
  };
}
