import { useEffect, useMemo, useRef } from "react";
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

const PIN_HEIGHT_M = 46;
const PIN_WIDTH_M = 30;
const PIN_STEM_M = 14;
const TAG_FONT_M = 26;
const TAG_PAD_M = 10;
const TAG_LINE_M = 34;

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
  const panRef = useRef<{ px: number; py: number; view: PlanViewport } | null>(null);
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

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !onViewportChange) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const factor = Math.exp(pixels * 0.0012);
      onViewportChange({
        x: view.x + (view.w - view.w * factor) * px,
        y: view.y + (view.h - view.h * factor) * py,
        w: view.w * factor,
        h: view.h * factor,
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [model.sideM, onViewportChange, view.h, view.w, view.x, view.y]);

  return (
    <svg
      ref={svgRef}
      className="plan demographics-explorer-map"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      role="img"
      aria-label="Demographics explorer map"
      data-fit-counter={fitCounter}
      style={{ touchAction: "none" }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const target = event.target as Element;
        const pinId = target.closest("[data-demo-pin]")?.getAttribute("data-demo-pin") as DemographicsPinId | null;
        if (pinId && state.pins[pinId]) {
          const start = { x: event.clientX, y: event.clientY, pin: state.pins[pinId]! };
          event.currentTarget.setPointerCapture(event.pointerId);
          const move = (moveEvent: PointerEvent) => {
            if (moveEvent.pointerId !== event.pointerId) return;
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
          const up = (upEvent: PointerEvent) => {
            if (upEvent.pointerId !== event.pointerId) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            event.currentTarget.removeEventListener("pointermove", move);
            event.currentTarget.removeEventListener("pointerup", up);
            event.currentTarget.removeEventListener("pointercancel", up);
          };
          event.currentTarget.addEventListener("pointermove", move);
          event.currentTarget.addEventListener("pointerup", up);
          event.currentTarget.addEventListener("pointercancel", up);
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!onViewportChange) return;
        panRef.current = { px: event.clientX, py: event.clientY, view: { ...view } };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const start = panRef.current;
        const el = svgRef.current;
        if (!start || !el || !onViewportChange) return;
        const scale = view.w / el.clientWidth;
        onViewportChange({
          ...start.view,
          x: start.view.x - (event.clientX - start.px) * scale,
          y: start.view.y - (event.clientY - start.py) * scale,
        });
      }}
      onPointerUp={(event) => {
        panRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
    >
      <rect
        x={view.x}
        y={view.y}
        width={view.w}
        height={view.h}
        fill="transparent"
        pointerEvents="all"
      />
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
            strokeWidth={0.35}
            vectorEffect="non-scaling-stroke"
            pointerEvents="visiblePainted"
          />
        );
      })}
      {pinList.map(([pinId, pin]) => {
        const colour = pinColour(pinId);
        const r = state.radiusM;
        const stats = pinId === "a" ? statsA : statsB;
        const tag = pinTag(stats, pin.label);
        const tipY = pin.north - PIN_HEIGHT_M;
        const tagX = pin.east + PIN_WIDTH_M * 0.55;
        const tagY = tipY - TAG_LINE_M;
        const tagWidth = tag.length * TAG_FONT_M * 0.52 + TAG_PAD_M * 2;
        const tagHeight = TAG_FONT_M * 1.45;
        return (
          <g key={pinId} data-demo-pin={pinId} style={{ cursor: "grab" }} pointerEvents="all">
            <circle
              cx={pin.east}
              cy={pin.north}
              r={r}
              fill="none"
              stroke={colour}
              strokeWidth={2.4}
              strokeDasharray="14 10"
              vectorEffect="non-scaling-stroke"
              opacity={0.95}
              pointerEvents="none"
            />
            <path
              d={`M ${pin.east} ${pin.north - PIN_STEM_M} C ${pin.east + PIN_WIDTH_M * 0.55} ${pin.north - PIN_STEM_M} ${pin.east + PIN_WIDTH_M * 0.55} ${tipY + PIN_HEIGHT_M * 0.35} ${pin.east} ${tipY} C ${pin.east - PIN_WIDTH_M * 0.55} ${tipY + PIN_HEIGHT_M * 0.35} ${pin.east - PIN_WIDTH_M * 0.55} ${pin.north - PIN_STEM_M} ${pin.east} ${pin.north - PIN_STEM_M} Z`}
              fill={colour}
              stroke={getColour("--demographics-panel-text")}
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={pin.east}
              cy={pin.north - PIN_STEM_M}
              r={PIN_WIDTH_M * 0.55}
              fill="transparent"
              pointerEvents="all"
            />
            <circle cx={pin.east} cy={tipY - PIN_HEIGHT_M * 0.08} r={PIN_WIDTH_M * 0.34} fill={getColour("--demographics-panel-bg")} pointerEvents="none" />
            <text
              x={pin.east}
              y={tipY + PIN_HEIGHT_M * 0.02}
              textAnchor="middle"
              fontSize={PIN_WIDTH_M * 0.55}
              fontWeight={700}
              fill={getColour("--demographics-panel-text")}
              pointerEvents="none"
            >
              {pinId.toUpperCase()}
            </text>
            <rect
              x={tagX}
              y={tagY}
              width={tagWidth}
              height={tagHeight}
              rx={4}
              fill={getColour("--demographics-panel-bg")}
              stroke={colour}
              strokeWidth={0.8}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <text
              x={tagX + TAG_PAD_M}
              y={tagY + tagHeight * 0.68}
              fontSize={TAG_FONT_M}
              fontWeight={600}
              fill={getColour("--demographics-panel-text")}
              pointerEvents="none"
            >
              {tag}
            </text>
          </g>
        );
      })}
      <g transform={`translate(${view.x + 16} ${view.y + 16})`} pointerEvents="none">
        <rect
          x={0}
          y={0}
          width={168}
          height={32}
          rx={3}
          fill={getColour("--demographics-panel-bg")}
          stroke={getColour("--demographics-parcel-line")}
          strokeWidth={0.35}
          vectorEffect="non-scaling-stroke"
        />
        <text x={5} y={9} className="demo-legend-title">
          RESIDENTS / HA
        </text>
        <text x={5} y={17} className="demo-legend-sub">
          SA1 → PARCEL
        </text>
        <defs>
          <linearGradient id="demo-density-ramp" x1="0%" y1="0%" x2="100%" y2="0%">
            {rampStops.map((stop, index) => (
              <stop key={index} offset={`${(index / (rampStops.length - 1)) * 100}%`} stopColor={stop} />
            ))}
          </linearGradient>
        </defs>
        <rect x={5} y={20} width={158} height={6} fill="url(#demo-density-ramp)" />
        <text x={5} y={30} className="demo-legend-scale">
          0
        </text>
        <text x={55} y={30} className="demo-legend-scale">
          40
        </text>
        <text x={105} y={30} className="demo-legend-scale">
          80
        </text>
        <text x={145} y={30} className="demo-legend-scale">
          160+
        </text>
      </g>
    </svg>
  );
}
