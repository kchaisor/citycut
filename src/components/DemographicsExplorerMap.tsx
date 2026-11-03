import { useMemo, useRef } from "react";
import { getColour } from "../lib/colours";
import { toLocal } from "../lib/geo";
import { planViewportExtent, type PlanViewport } from "../lib/planViewport";
import type { CityModel } from "../types";
import type { DemographicsParcelIndex, DemographicsParcelRecord } from "../lib/demographicsParcels";
import { parcelColourMetric } from "../lib/demographicsParcels";
import { colourForMetric } from "../lib/demographicsDensityColour";
import type { DemographicsExplorerState, DemographicsPinId } from "../lib/demographicsExplorerReducer";
import type { DemographicsExplorerAction } from "../lib/demographicsExplorerReducer";
import type { DemographicsCatchmentStats } from "../lib/demographicsCatchment";

function screenPx(mm: number): number {
  return mm * 3.78;
}

function parcelPath(ring: [number, number][], center: CityModel["center"]): string {
  return (
    ring
      .map(([lon, lat], index) => {
        const [x, y] = toLocal(lat, lon, center);
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ") + " Z"
  );
}

function pinColour(id: DemographicsPinId): string {
  return getColour(id === "a" ? "--demographics-pin-a" : "--demographics-pin-b");
}

function pinTag(stats: DemographicsCatchmentStats | null | undefined, fallback: string): string {
  if (!stats || stats.population <= 0) return fallback;
  const parcels = stats.parcelCount > 0 ? `${stats.parcelCount.toLocaleString()} parcels` : "SA1 blend";
  return `${fallback} · ${parcels} · ${stats.population.toLocaleString()} res`;
}

export function DemographicsExplorerMap({
  model,
  parcels,
  parcelIndex,
  state,
  dispatch,
  viewport,
  onViewportChange,
  fitCounter = 0,
  statsA = null,
  statsB = null,
}: {
  model: CityModel;
  parcels: DemographicsParcelRecord[];
  parcelIndex: DemographicsParcelIndex | null;
  state: DemographicsExplorerState;
  dispatch: (action: DemographicsExplorerAction) => void;
  viewport?: PlanViewport;
  onViewportChange?: (view: PlanViewport) => void;
  fitCounter?: number;
  statsA?: DemographicsCatchmentStats | null;
  statsB?: DemographicsCatchmentStats | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const view = viewport ?? planViewportExtent(model.sideM);

  const visibleParcels = useMemo(() => {
    if (!parcelIndex) return parcels;
    const hits = parcelIndex.search({
      minX: view.x,
      minY: view.y,
      maxX: view.x + view.w,
      maxY: view.y + view.h,
    });
    return hits.length > 0 ? hits : parcels;
  }, [parcelIndex, parcels, view.h, view.w, view.x, view.y]);

  const pinList = (["a", "b"] as const).flatMap((id) => (state.pins[id] ? ([[id, state.pins[id]!] as const] ) : []));

  const mapBg = getColour("--demographics-map-bg");
  const parcelLine = getColour("--demographics-parcel-line");
  const outsideFill = getColour("--demographics-parcel-outside");
  const rampStops = [
    getColour("--demographics-density-0"),
    getColour("--demographics-density-1"),
    getColour("--demographics-density-2"),
    getColour("--demographics-density-3"),
    getColour("--demographics-density-4"),
    getColour("--demographics-density-5"),
  ];

  return (
    <svg
      ref={svgRef}
      className="plan demographics-explorer-map"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      role="img"
      aria-label="Demographics explorer map"
      data-fit-counter={fitCounter}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const target = event.target as Element;
        const pinId = target.closest("[data-demo-pin]")?.getAttribute("data-demo-pin") as DemographicsPinId | null;
        if (pinId && state.pins[pinId]) {
          const start = { x: event.clientX, y: event.clientY, pin: state.pins[pinId]! };
          const move = (moveEvent: PointerEvent) => {
            const el = svgRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const scale = view.w / rect.width;
            const dx = (moveEvent.clientX - start.x) * scale;
            const dy = (moveEvent.clientY - start.y) * scale;
            dispatch({
              type: "movePin",
              pin: pinId,
              east: start.pin.east + dx,
              north: start.pin.north + dy,
            });
          };
          const up = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.removeEventListener("pointerup", up);
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
          event.preventDefault();
          return;
        }
        if (!onViewportChange) return;
        const panStart = { x: event.clientX, y: event.clientY, view: { ...view } };
        const panMove = (moveEvent: PointerEvent) => {
          const el = svgRef.current;
          if (!el) return;
          const scale = view.w / el.clientWidth;
          onViewportChange({
            ...panStart.view,
            x: panStart.view.x - (moveEvent.clientX - panStart.x) * scale,
            y: panStart.view.y - (moveEvent.clientY - panStart.y) * scale,
          });
        };
        const panUp = () => {
          window.removeEventListener("pointermove", panMove);
          window.removeEventListener("pointerup", panUp);
        };
        window.addEventListener("pointermove", panMove);
        window.addEventListener("pointerup", panUp);
      }}
    >
      <rect x={view.x - view.w} y={view.y - view.h} width={view.w * 3} height={view.h * 3} fill={mapBg} />
      {visibleParcels.map((parcel) => {
        const [cx, cy] = toLocal(parcel.centroidLat, parcel.centroidLon, model.center);
        let tinted = false;
        for (const [, pin] of pinList) {
          const dx = cx - pin.east;
          const dy = cy - pin.north;
          if (dx * dx + dy * dy <= state.radiusM * state.radiusM) {
            tinted = true;
            break;
          }
        }
        const metric = parcelColourMetric(parcel, state.colourBy);
        const fill = tinted ? colourForMetric(metric, state.colourBy) : outsideFill;
        return (
          <path
            key={parcel.id}
            d={parcelPath(parcel.ring, model.center)}
            fill={fill}
            stroke={parcelLine}
            strokeWidth={screenPx(0.05)}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {pinList.map(([pinId, pin]) => {
        const colour = pinColour(pinId);
        const r = state.radiusM;
        const stats = pinId === "a" ? statsA : statsB;
        const tag = pinTag(stats, pin.label);
        return (
          <g key={pinId} data-demo-pin={pinId} style={{ cursor: "grab" }}>
            <circle
              cx={pin.east}
              cy={pin.north}
              r={r}
              fill="none"
              stroke={colour}
              strokeWidth={screenPx(0.28)}
              strokeDasharray={`${screenPx(2.4)} ${screenPx(1.6)}`}
              vectorEffect="non-scaling-stroke"
              opacity={0.95}
            />
            <path
              d={`M ${pin.east} ${pin.north - screenPx(4.2)} l ${screenPx(2.1)} ${screenPx(4.2)} h ${-screenPx(4.2)} z`}
              fill={colour}
              stroke={getColour("--demographics-panel-text")}
              strokeWidth={screenPx(0.12)}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={pin.east} cy={pin.north - screenPx(5.4)} r={screenPx(0.65)} fill={getColour("--demographics-panel-bg")} />
            <g transform={`translate(${pin.east + screenPx(3.2)} ${pin.north - screenPx(7.5)})`}>
              <rect
                x={0}
                y={0}
                width={screenPx(tag.length * 0.58)}
                height={screenPx(4.8)}
                rx={screenPx(0.6)}
                fill={getColour("--demographics-panel-bg")}
                stroke={colour}
                strokeWidth={screenPx(0.1)}
                vectorEffect="non-scaling-stroke"
              />
              <text x={screenPx(0.8)} y={screenPx(2.9)} className="demo-pin-tag mono" fill={getColour("--demographics-panel-text")}>
                {tag}
              </text>
            </g>
          </g>
        );
      })}
      <g transform={`translate(${view.x + screenPx(4)} ${view.y + screenPx(4)})`}>
        <rect
          x={0}
          y={0}
          width={screenPx(42)}
          height={screenPx(8)}
          rx={screenPx(0.8)}
          fill={getColour("--demographics-panel-bg")}
          stroke={getColour("--demographics-parcel-line")}
          strokeWidth={screenPx(0.08)}
          vectorEffect="non-scaling-stroke"
        />
        <text x={screenPx(1.2)} y={screenPx(2.4)} className="demo-legend-title">
          RESIDENTS / HA
        </text>
        <text x={screenPx(1.2)} y={screenPx(4.6)} className="demo-legend-sub">
          SA1 → PARCEL
        </text>
        <defs>
          <linearGradient id="demo-density-ramp" x1="0%" y1="0%" x2="100%" y2="0%">
            {rampStops.map((stop, index) => (
              <stop key={index} offset={`${(index / (rampStops.length - 1)) * 100}%`} stopColor={stop} />
            ))}
          </linearGradient>
        </defs>
        <rect x={screenPx(1.2)} y={screenPx(5.4)} width={screenPx(39)} height={screenPx(1.6)} fill="url(#demo-density-ramp)" />
        <text x={screenPx(1.2)} y={screenPx(7.6)} className="demo-legend-scale mono">
          0
        </text>
        <text x={screenPx(14)} y={screenPx(7.6)} className="demo-legend-scale mono">
          40
        </text>
        <text x={screenPx(26)} y={screenPx(7.6)} className="demo-legend-scale mono">
          80
        </text>
        <text x={screenPx(36)} y={screenPx(7.6)} className="demo-legend-scale mono">
          160+
        </text>
      </g>
    </svg>
  );
}
