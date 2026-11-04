import { cellToBoundary } from "h3-js";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { applyBasemapStyleToMap, loadBasemapStyle } from "../../lib/loadMapStyle";
import { getColour } from "../../lib/colours";
import { useColourRevision } from "../../lib/useColourRevision";
import { FLAT_NORTH_UP_MAP_OPTIONS, applyFlatNorthUpMapHandlers } from "../../lib/mapStageMapOptions";
import {
  REACH_BUDGET_MAX,
  REACH_BUDGET_MIN,
  REACH_H3_RES,
  REACH_PERIODS,
  REACH_UNREACHABLE,
  type ReachPeriod,
} from "../../lib/reach/constants";
import type { ReachCellTimes, ReachDataset } from "../../lib/reach/types";
import { classifyPtOnly } from "../../lib/reach/computeReach";
import { MELBOURNE_CBD } from "../../lib/reach/constants";

function hexFeature(h3: string, props: Record<string, string | number>) {
  const boundary = cellToBoundary(h3).map(([lat, lon]) => [lon, lat] as [number, number]);
  boundary.push(boundary[0]!);
  return {
    type: "Feature" as const,
    properties: props,
    geometry: { type: "Polygon" as const, coordinates: [boundary] },
  };
}

function ensureReachLayers(map: maplibregl.Map) {
  if (map.getSource("reach-hexes")) return;
  map.addSource("reach-hexes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "reach-hex-fill",
    type: "fill",
    source: "reach-hexes",
    paint: {
      "fill-color": [
        "match",
        ["get", "kind"],
        "origin",
        getColour("--reach-origin-fill"),
        "walk",
        getColour("--reach-walk-fill"),
        "transit",
        getColour("--reach-transit-fill"),
        getColour("--reach-walk-muted"),
      ],
      "fill-opacity": [
        "case",
        ["==", ["get", "kind"], "walk"],
        ["interpolate", ["linear"], ["get", "minute"], 1, 0.95, 15, 0.45],
        0.72,
      ],
    },
  });
  map.addLayer({
    id: "reach-hex-line",
    type: "line",
    source: "reach-hexes",
    paint: {
      "line-color": getColour("--reach-hex-edge"),
      "line-width": 0.6,
    },
  });
  map.addLayer({
    id: "reach-hex-label",
    type: "symbol",
    source: "reach-hexes",
    minzoom: 12,
    layout: {
      "text-field": ["to-string", ["get", "minute"]],
      "text-size": 10,
      "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": getColour("--reach-panel-text"),
    },
    filter: ["in", ["get", "kind"], ["literal", ["walk", "transit"]]],
  });
}

function installReachMapQaHooks(map: maplibregl.Map) {
  if (typeof window === "undefined") return;
  const qa = {
    addLayerCalls: 0,
    removeLayerCalls: 0,
    removeSourceCalls: 0,
    setStyleCalls: 0,
    canvasBlankFrames: 0,
  };
  window.__citycutReachMapQa = qa;
  const origAddLayer = map.addLayer.bind(map);
  map.addLayer = (...args: Parameters<maplibregl.Map["addLayer"]>) => {
    qa.addLayerCalls += 1;
    return origAddLayer(...args);
  };
  const origRemoveLayer = map.removeLayer.bind(map);
  map.removeLayer = (...args: Parameters<maplibregl.Map["removeLayer"]>) => {
    qa.removeLayerCalls += 1;
    return origRemoveLayer(...args);
  };
  const origRemoveSource = map.removeSource.bind(map);
  map.removeSource = (...args: Parameters<maplibregl.Map["removeSource"]>) => {
    qa.removeSourceCalls += 1;
    return origRemoveSource(...args);
  };
  const origSetStyle = map.setStyle.bind(map);
  map.setStyle = (...args: Parameters<maplibregl.Map["setStyle"]>) => {
    qa.setStyleCalls += 1;
    return origSetStyle(...args);
  };
}

export function ReachMapExplorer({
  dataset,
  times,
  budgetMin,
  period,
  onPeriod,
  onBudget,
  originCellIndex,
  onPickCell,
  placingOrigin,
}: {
  dataset: ReachDataset;
  times: ReachCellTimes | null;
  budgetMin: number;
  onBudget: (value: number) => void;
  period: ReachPeriod;
  onPeriod: (period: ReachPeriod) => void;
  originCellIndex: number | null;
  onPickCell: (cellIndex: number) => void;
  placingOrigin: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapReadyRef = useRef(false);
  const pendingGeojsonRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const rafRef = useRef<number | null>(null);
  const onPickCellRef = useRef(onPickCell);
  onPickCellRef.current = onPickCell;
  const colourTick = useColourRevision();

  const ptOnly = useMemo(() => {
    if (!times) return [];
    return classifyPtOnly(times.walkMin, times.combinedMin, budgetMin);
  }, [times, budgetMin]);

  const geojson = useMemo((): GeoJSON.FeatureCollection => {
    if (!times) {
      return { type: "FeatureCollection", features: [] };
    }
    const features: ReturnType<typeof hexFeature>[] = [];
    for (let i = 0; i < dataset.h3Indices.length; i++) {
      const walk = times.walkMin[i]!;
      const combined = times.combinedMin[i]!;
      let kind = "hidden";
      let minute = 0;
      if (i === originCellIndex) {
        kind = "origin";
      } else if (walk <= budgetMin && walk < REACH_UNREACHABLE) {
        kind = "walk";
        minute = walk;
      } else if (ptOnly[i] && combined <= budgetMin) {
        kind = "transit";
        minute = combined;
      }
      if (kind === "hidden") continue;
      features.push(hexFeature(dataset.h3Indices[i]!, { kind, minute, index: i }));
    }
    return { type: "FeatureCollection", features };
  }, [budgetMin, dataset.h3Indices, originCellIndex, ptOnly, times]);

  const flushGeojson = (map: maplibregl.Map, data: GeoJSON.FeatureCollection) => {
    ensureReachLayers(map);
    const source = map.getSource("reach-hexes") as maplibregl.GeoJSONSource;
    source.setData(data);
    map.setPaintProperty("reach-hex-fill", "fill-color", [
      "match",
      ["get", "kind"],
      "origin",
      getColour("--reach-origin-fill"),
      "walk",
      getColour("--reach-walk-fill"),
      "transit",
      getColour("--reach-transit-fill"),
      getColour("--reach-walk-muted"),
    ]);
  };

  useEffect(() => {
    pendingGeojsonRef.current = geojson;
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const next = pendingGeojsonRef.current;
      if (!next || !mapRef.current) return;
      flushGeojson(mapRef.current, next);
    });
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [geojson, colourTick]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    void loadBasemapStyle("map").then(({ style }) => {
      if (cancelled) return;
      map = new maplibregl.Map({
        container,
        style: typeof style === "string" ? undefined : style,
        center: [MELBOURNE_CBD.lon, MELBOURNE_CBD.lat],
        zoom: 13,
        attributionControl: false,
        ...FLAT_NORTH_UP_MAP_OPTIONS,
      });
      mapRef.current = map;
      installReachMapQaHooks(map);
      if (typeof style === "string") applyBasemapStyleToMap(map, style);
      applyFlatNorthUpMapHandlers(map);
      map.on("load", () => {
        mapReadyRef.current = true;
        if (pendingGeojsonRef.current) flushGeojson(map!, pendingGeojsonRef.current);
        map!.resize();
      });
      map.on("click", (event) => {
        const lng = event.lngLat.lng;
        const lat = event.lngLat.lat;
        let best = 0;
        let bestD = Number.POSITIVE_INFINITY;
        for (let i = 0; i < dataset.lat.length; i++) {
          const dlat = dataset.lat[i]! - lat;
          const dlng = dataset.lng[i]! - lng;
          const d = dlat * dlat + dlng * dlng;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        onPickCellRef.current(best);
      });
    });
    const ro = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    ro.observe(container);
    return () => {
      cancelled = true;
      mapReadyRef.current = false;
      ro.disconnect();
      map?.remove();
      mapRef.current = null;
      if (typeof window !== "undefined") delete window.__citycutReachMapQa;
    };
  }, [dataset.lat.length]);

  useEffect(() => {
    pendingGeojsonRef.current = geojson;
  }, [geojson]);

  return (
    <div className="reach-map-shell" data-reach-map="true">
      <div ref={containerRef} className="reach-map-canvas" />
      {placingOrigin ? (
        <p className="reach-map-hint" role="status">
          Click or drag on the map to set your reach origin.
        </p>
      ) : null}
      <div className="reach-legend-float" aria-label="Reach legend">
        {dataset.manifest.exampleData ? <span className="reach-example-tag">Example data</span> : null}
        <span>
          <i style={{ background: getColour("--reach-walk-fill") }} aria-hidden="true" /> Walk
        </span>
        <span>
          <i style={{ background: getColour("--reach-transit-fill") }} aria-hidden="true" /> + Transit only
        </span>
        <span>
          <i style={{ background: getColour("--reach-origin-fill") }} aria-hidden="true" /> Origin
        </span>
        <span className="mono reach-legend-meta">H3 res {REACH_H3_RES} · minutes</span>
      </div>
      <div className="reach-map-controls hud-card" data-reach-map-controls="true">
        <label className="reach-slider-field">
          <span className="mono">{budgetMin} min</span>
          <input
            type="range"
            min={REACH_BUDGET_MIN}
            max={REACH_BUDGET_MAX}
            step={1}
            value={budgetMin}
            onChange={(event) => onBudget(Number.parseInt(event.target.value, 10))}
            aria-label="Time budget"
          />
        </label>
        <div className="reach-period-toggle" role="group" aria-label="Time of week">
          {REACH_PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={period === item.id ? "reach-period-btn is-active" : "reach-period-btn"}
              aria-pressed={period === item.id}
              onClick={() => onPeriod(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    __citycutReachMapQa?: {
      addLayerCalls: number;
      removeLayerCalls: number;
      removeSourceCalls: number;
      setStyleCalls: number;
      canvasBlankFrames: number;
    };
  }
}
