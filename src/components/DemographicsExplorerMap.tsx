import { useMemo, useRef } from "react";
import { figureGroundModelPaths } from "../lib/figureGround";
import { getColour } from "../lib/colours";
import { toLocal } from "../lib/geo";
import { planViewportExtent, type PlanViewport } from "../lib/planViewport";
import type { CityModel } from "../types";
import type { DemographicsParcelIndex, DemographicsParcelRecord } from "../lib/demographicsParcels";
import { parcelColourMetric } from "../lib/demographicsParcels";
import { colourForMetric } from "../lib/demographicsDensityColour";
import type { DemographicsExplorerState, DemographicsPinId } from "../lib/demographicsExplorerReducer";
import type { DemographicsExplorerAction } from "../lib/demographicsExplorerReducer";
import { densityRampStops } from "../lib/demographicsParcels";

function cutSquareRing(sideM: number): [number, number][] {
  const half = sideM / 2;
  return [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
}

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

export function DemographicsExplorerMap({
  model,
  parcels,
  parcelIndex,
  state,
  dispatch,
  viewport,
  onViewportChange,
  fitCounter = 0,
  exampleData = false,
}: {
  model: CityModel;
  parcels: DemographicsParcelRecord[];
  parcelIndex: DemographicsParcelIndex | null;
  state: DemographicsExplorerState;
  dispatch: (action: DemographicsExplorerAction) => void;
  viewport?: PlanViewport;
  onViewportChange?: (view: PlanViewport) => void;
  fitCounter?: number;
  exampleData?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const view = viewport ?? planViewportExtent(model.sideM);
  const buildings = useMemo(() => figureGroundModelPaths(model.buildings, model.sideM), [model]);
  const frameD = useMemo(() => {
    const ring = cutSquareRing(model.sideM);
    return ring.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ") + " Z";
  }, [model.sideM]);

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
  const buildingFill = getColour("--demographics-building-fill");
  const buildingStroke = getColour("--demographics-building-stroke");
  const parcelLine = getColour("--demographics-parcel-line");
  const outsideFill = getColour("--demographics-parcel-outside");
  const cutStroke = getColour("--demographics-cut-frame");

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
        for (const [pinId, pin] of pinList) {
          const dx = cx - pin.east;
          const dy = cy - pin.north;
          if (dx * dx + dy * dy <= state.radiusM * state.radiusM) {
            tinted = true;
            void pinId;
            break;
          }
        }
        const metric = parcelColourMetric(
          parcel,
          state.colourBy,
        );
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
      {buildings.map((path, index) => (
        <path
          key={index}
          d={path}
          fill={buildingFill}
          stroke={buildingStroke}
          strokeWidth={screenPx(0.06)}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path d={frameD} fill="none" stroke={cutStroke} strokeWidth={screenPx(0.35)} vectorEffect="non-scaling-stroke" />
      {pinList.map(([pinId, pin]) => {
        const colour = pinColour(pinId);
        const r = state.radiusM;
        return (
          <g key={pinId} data-demo-pin={pinId} style={{ cursor: "grab" }}>
            <circle
              cx={pin.east}
              cy={pin.north}
              r={r}
              fill="none"
              stroke={colour}
              strokeWidth={screenPx(0.18)}
              strokeDasharray={`${screenPx(1.2)} ${screenPx(0.9)}`}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={pin.east} cy={pin.north} r={screenPx(0.55)} fill={colour} />
            <text
              x={pin.east + screenPx(2.2)}
              y={pin.north - screenPx(1.4)}
              className="demo-pin-label mono"
              fill={colour}
            >
              {pinId.toUpperCase()} {pin.label}
            </text>
          </g>
        );
      })}
      {exampleData ? (
        <g transform={`translate(${view.x + screenPx(3)} ${view.y + screenPx(3)})`}>
          <rect
            x={0}
            y={0}
            width={screenPx(28)}
            height={screenPx(6)}
            rx={screenPx(1)}
            fill={getColour("--demographics-example-badge")}
          />
          <text x={screenPx(1.2)} y={screenPx(4.2)} className="demo-example-badge">
            EXAMPLE DATA
          </text>
        </g>
      ) : null}
      <g transform={`translate(${view.x + screenPx(3)} ${view.y + screenPx(10)})`}>
        <text className="demo-ramp-title">RESIDENTS / HA</text>
        {densityRampStops().map((stop, index) => (
          <g key={stop} transform={`translate(0 ${index * screenPx(2.4)})`}>
            <rect
              x={0}
              y={0}
              width={screenPx(3)}
              height={screenPx(1.8)}
              fill={getColour(
                (
                  [
                    "--demographics-density-0",
                    "--demographics-density-1",
                    "--demographics-density-2",
                    "--demographics-density-3",
                    "--demographics-density-4",
                    "--demographics-density-5",
                  ] as const
                )[Math.min(index, 5)],
              )}
            />
            <text x={screenPx(3.8)} y={screenPx(1.5)} className="demo-ramp-label mono">
              {stop === 160 ? "160+" : stop}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
