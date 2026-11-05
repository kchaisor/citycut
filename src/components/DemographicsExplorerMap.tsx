import { useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import { getColour } from "../lib/colours";
import type { DemographicsParcelGeoIndex } from "../lib/demographicsParcelGeoIndex";
import { searchParcelsNearPin } from "../lib/demographicsParcelGeoIndex";
import type { DemographicsParcelRecord } from "../lib/demographicsParcels";
import type { DemographicsCatchmentStats } from "../lib/demographicsCatchment";
import type {
  DemographicsExplorerAction,
  DemographicsExplorerState,
  DemographicsPin,
  DemographicsPinId,
} from "../lib/demographicsExplorerReducer";
import { pinLonLat } from "../lib/demographicsExplorerPins";
import {
  DEMO_PIN_LAYER_A,
  DEMO_PIN_LAYER_B,
  ensureDemographicsOverlayLayers,
  updateDemographicsCatchmentFill,
  updateDemographicsPinOverlay,
} from "../lib/demographicsMapOverlays";
import { catchmentParcelsGeoJson } from "../lib/demographicsCatchmentGeoJson";
import { haversineDistanceM } from "../lib/haversine";
import { isDemographicsQaMode, resolveDemographicsPinLabel } from "../lib/demographicsPinLabel";
import type { LonLat } from "../types";

function pinColour(id: DemographicsPinId): string {
  return getColour(id === "a" ? "--demographics-pin-a" : "--demographics-pin-b");
}

function pinTag(stats: DemographicsCatchmentStats | null | undefined, label: string): string {
  if (!stats || stats.population <= 0) return label;
  const parcels = stats.parcelCount > 0 ? `${stats.parcelCount.toLocaleString()} parcels` : "SA1 blend";
  return `${label} · ${parcels} · ${stats.population.toLocaleString()} res`;
}

function effectivePin(pin: DemographicsPin, draft: LonLat | null): DemographicsPin {
  if (!draft) return pin;
  return { ...pin, lon: draft.lon, lat: draft.lat };
}

export function DemographicsExplorerMap({
  map,
  geoIndex,
  parcelCount,
  state,
  dispatch,
  statsA = null,
  statsB = null,
  onLivePins,
}: {
  map: maplibregl.Map;
  geoIndex: DemographicsParcelGeoIndex | null;
  parcelCount: number;
  state: DemographicsExplorerState;
  dispatch: (action: DemographicsExplorerAction) => void;
  statsA?: DemographicsCatchmentStats | null;
  statsB?: DemographicsCatchmentStats | null;
  onLivePins: (pins: Partial<Record<DemographicsPinId, LonLat>>) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelAbortRef = useRef<AbortController | null>(null);
  const [draftPin, setDraftPin] = useState<{ id: DemographicsPinId; lon: number; lat: number } | null>(
    null,
  );
  const [labelTick, setLabelTick] = useState(0);

  const livePositions = useMemo(() => {
    const out: Partial<Record<DemographicsPinId, LonLat>> = {};
    if (state.pins.a) {
      out.a = draftPin?.id === "a" ? { lon: draftPin.lon, lat: draftPin.lat } : pinLonLat(state.pins.a);
    }
    if (state.pins.b) {
      out.b = draftPin?.id === "b" ? { lon: draftPin.lon, lat: draftPin.lat } : pinLonLat(state.pins.b);
    }
    return out;
  }, [draftPin, state.pins.a, state.pins.b]);

  useEffect(() => {
    onLivePins(livePositions);
  }, [livePositions, onLivePins]);

  useEffect(() => {
    if (!isDemographicsQaMode()) return;
    window.__citycutDemographicsQaMovePin = (id: DemographicsPinId, lon: number, lat: number) => {
      dispatch({ type: "movePin", pin: id, lon, lat });
      scheduleSync();
    };
    return () => {
      delete window.__citycutDemographicsQaMovePin;
    };
  }, [dispatch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__citycutDemographicsPins = {
      a: state.pins.a
        ? {
            lon: livePositions.a?.lon ?? state.pins.a.lon,
            lat: livePositions.a?.lat ?? state.pins.a.lat,
            label: state.pins.a.label,
          }
        : null,
      b: state.pins.b
        ? {
            lon: livePositions.b?.lon ?? state.pins.b.lon,
            lat: livePositions.b?.lat ?? state.pins.b.lat,
            label: state.pins.b.label,
          }
        : null,
    };
    window.__citycutDemographicsRadiusM = state.radiusM;
  }, [livePositions, state.pins.a, state.pins.b, state.radiusM]);

  const syncOverlays = () => {
    if (state.pins.a) {
      const pos = livePositions.a ?? pinLonLat(state.pins.a);
      updateDemographicsPinOverlay(map, "a", pos, state.radiusM);
    } else {
      updateDemographicsPinOverlay(map, "a", null, state.radiusM);
    }
    if (state.pins.b && state.panelMode === "compare") {
      const pos = livePositions.b ?? pinLonLat(state.pins.b);
      updateDemographicsPinOverlay(map, "b", pos, state.radiusM);
    } else {
      updateDemographicsPinOverlay(map, "b", null, state.radiusM);
    }
  };

  const syncCatchmentPaint = () => {
    ensureDemographicsOverlayLayers(map);
    const tinted = new Map<string, DemographicsParcelRecord>();
    if (!geoIndex) {
      updateDemographicsCatchmentFill(map, catchmentParcelsGeoJson([], state.colourBy));
      if (typeof window !== "undefined") {
        window.__citycutDemographicsCatchmentTinted = 0;
        window.__citycutDemographicsCatchmentAudit = { tinted: 0, tintedOutside: 0, insideUntinted: 0 };
      }
      return;
    }
    if (livePositions.a) {
      for (const parcel of searchParcelsNearPin(geoIndex, livePositions.a, state.radiusM)) {
        tinted.set(parcel.id, parcel);
      }
    }
    if (livePositions.b && state.panelMode === "compare") {
      for (const parcel of searchParcelsNearPin(geoIndex, livePositions.b, state.radiusM)) {
        tinted.set(parcel.id, parcel);
      }
    }
    const tintedList = [...tinted.values()];
    updateDemographicsCatchmentFill(map, catchmentParcelsGeoJson(tintedList, state.colourBy));
    if (typeof window !== "undefined") {
      window.__citycutDemographicsCatchmentTinted = tintedList.length;
      let tintedOutside = 0;
      const pins = [livePositions.a, livePositions.b].filter(Boolean) as LonLat[];
      for (const parcel of tintedList) {
        const c = { lon: parcel.centroidLon, lat: parcel.centroidLat };
        const inside = pins.some((pin) => haversineDistanceM(c, pin) <= state.radiusM);
        if (!inside) tintedOutside += 1;
      }
      let insideUntinted = 0;
      for (const pin of pins) {
        for (const parcel of searchParcelsNearPin(geoIndex, pin, state.radiusM)) {
          if (!tinted.has(parcel.id)) insideUntinted += 1;
        }
      }
      window.__citycutDemographicsCatchmentAudit = {
        tinted: tintedList.length,
        tintedOutside,
        insideUntinted,
      };
    }
  };

  const scheduleSync = () => {
    syncOverlays();
    syncCatchmentPaint();
    setLabelTick((t) => t + 1);
  };

  useEffect(() => {
    scheduleSync();
  }, [
    map,
    geoIndex,
    parcelCount,
    state.radiusM,
    state.colourBy,
    state.panelMode,
    livePositions.a?.lon,
    livePositions.a?.lat,
    livePositions.b?.lon,
    livePositions.b?.lat,
  ]);

  useEffect(() => {
    const onMove = () => scheduleSync();
    map.on("move", onMove);
    map.on("resize", onMove);
    return () => {
      map.off("move", onMove);
      map.off("resize", onMove);
    };
  }, [map]);

  useEffect(() => {
    const pinId = draftPin?.id ?? null;
    const point = pinId ? livePositions[pinId] : null;
    if (!point) return;
    labelAbortRef.current?.abort();
    const controller = new AbortController();
    labelAbortRef.current = controller;
    const timer = window.setTimeout(() => {
      void resolveDemographicsPinLabel(point, controller.signal).then((label) => {
        if (controller.signal.aborted || !pinId) return;
        dispatch({ type: "setPinLabel", pin: pinId, label });
      });
    }, draftPin ? 0 : 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    dispatch,
    draftPin,
    livePositions.a?.lon,
    livePositions.a?.lat,
    livePositions.b?.lon,
    livePositions.b?.lat,
  ]);

  useEffect(() => {
    const pinLayers = [DEMO_PIN_LAYER_A, DEMO_PIN_LAYER_B];
    const onDown = (event: maplibregl.MapMouseEvent) => {
      if (event.originalEvent.button !== 0) return;
      const hitLayers = pinLayers.filter((layer) => map.getLayer(layer));
      if (!hitLayers.length) return;
      const feats = map.queryRenderedFeatures(event.point, { layers: hitLayers });
      if (!feats.length) return;
      const pinProp = feats[0].properties?.pin;
      let id: DemographicsPinId =
        pinProp === "a" || pinProp === "b" ? pinProp : feats[0].layer.id.includes("pin-a") ? "a" : "b";
      const pin = state.pins[id];
      if (!pin) return;
      event.preventDefault();
      map.dragPan.disable();
      const finishDrag = (clientX: number, clientY: number) => {
        window.removeEventListener("mousemove", onMoveWindow);
        window.removeEventListener("mouseup", onUpWindow);
        map.dragPan.enable();
        const rect = map.getCanvas().getBoundingClientRect();
        const after = map.unproject([clientX - rect.left, clientY - rect.top]);
        dispatch({ type: "movePin", pin: id, lon: after.lng, lat: after.lat });
        setDraftPin(null);
        scheduleSync();
      };
      const onMoveWindow = (ev: MouseEvent) => {
        const rect = map.getCanvas().getBoundingClientRect();
        const after = map.unproject([ev.clientX - rect.left, ev.clientY - rect.top]);
        setDraftPin({ id, lon: after.lng, lat: after.lat });
        scheduleSync();
      };
      const onUpWindow = (ev: MouseEvent) => {
        finishDrag(ev.clientX, ev.clientY);
      };
      window.addEventListener("mousemove", onMoveWindow);
      window.addEventListener("mouseup", onUpWindow);
    };
    map.on("mousedown", onDown);
    return () => {
      map.off("mousedown", onDown);
    };
  }, [dispatch, map, state.pins.a, state.pins.b]);

  const pinLabels = (["a", "b"] as const).flatMap((id) => {
    const pin = state.pins[id];
    if (!pin) return [];
    if (id === "b" && state.panelMode !== "compare") return [];
    const live = effectivePin(pin, draftPin?.id === id ? { lon: draftPin.lon, lat: draftPin.lat } : null);
    const stats = id === "a" ? statsA : statsB;
    const tag = pinTag(stats, live.label);
    const projected = map.project([live.lon, live.lat]);
    return [{ id, tag, colour: pinColour(id), x: projected.x, y: projected.y }];
  });

  void labelTick;

  return (
    <div ref={containerRef} className="demographics-explorer-map-ui fill" aria-hidden={false}>
      {pinLabels.map(({ id, tag, colour, x, y }) => (
        <div
          key={id}
          data-demo-pin={id}
          className="demographics-pin-tag"
          style={{
            position: "absolute",
            left: x + 14,
            top: y - 48,
            borderColor: colour,
            pointerEvents: "none",
          }}
        >
          {tag}
        </div>
      ))}
    </div>
  );
}
