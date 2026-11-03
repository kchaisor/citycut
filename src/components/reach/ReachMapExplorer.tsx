import { cellToBoundary } from "h3-js";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef } from "react";
import { applyBasemapStyleToMap, loadBasemapStyle } from "../../lib/loadMapStyle";
import { getColour } from "../../lib/colours";
import { useColourRevision } from "../../lib/useColourRevision";
import {
  REACH_BUDGET_MAX,
  REACH_BUDGET_MIN,
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
  const colourTick = useColourRevision();
  const ptOnly = useMemo(() => {
    if (!times) return [];
    return classifyPtOnly(times.walkMin, times.combinedMin, budgetMin);
  }, [times, budgetMin]);

  const geojson = useMemo(() => {
    if (!times) {
      return { type: "FeatureCollection" as const, features: [] as ReturnType<typeof hexFeature>[] };
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
    return { type: "FeatureCollection" as const, features };
  }, [budgetMin, dataset.h3Indices, originCellIndex, ptOnly, times]);

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
        zoom: 12.4,
        attributionControl: false,
        dragRotate: false,
        pitch: 0,
        bearing: 0,
      });
      mapRef.current = map;
      if (typeof style === "string") applyBasemapStyleToMap(map, style);
      map.on("load", () => {
        if (!map) return;
        map.addSource("reach-hexes", { type: "geojson", data: geojson });
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
            "fill-opacity": ["case", ["==", ["get", "kind"], "walk"], ["interpolate", ["linear"], ["get", "minute"], 1, 0.95, 15, 0.45], 0.72],
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
        onPickCell(best);
      });
    });
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [dataset.lat, dataset.lng, onPickCell]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource("reach-hexes") as maplibregl.GeoJSONSource | undefined;
    source?.setData(geojson);
  }, [geojson, colourTick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
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
  }, [colourTick]);

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
        <span className="mono reach-legend-meta">H3 res 9 · minutes</span>
      </div>
      <div className="reach-map-controls">
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
