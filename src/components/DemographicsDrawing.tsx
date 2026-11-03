import { useMemo, useRef } from "react";
import { figureGroundModelPaths } from "../lib/figureGround";
import { getColour } from "../lib/colours";
import { intersectionAreaM2 } from "../lib/comBuildingHeightsMatch";
import { toLocal } from "../lib/geo";
import { planViewportExtent, type PlanViewport } from "../lib/planViewport";
import type { CityModel } from "../types";
import type { DemographicsSa1Unit } from "../lib/demographicsTypes";

function cutSquareRing(sideM: number): [number, number][] {
  const half = sideM / 2;
  return [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];
}

function sa1FillOpacity(unit: DemographicsSa1Unit, maxPop: number): number {
  if (maxPop <= 0) return 0.15;
  return 0.12 + (unit.population / maxPop) * 0.55;
}

export function DemographicsDrawing({
  model,
  units,
  viewport,
  onViewportChange,
  fitCounter = 0,
}: {
  model: CityModel;
  units: DemographicsSa1Unit[];
  viewport?: PlanViewport;
  onViewportChange?: (view: PlanViewport) => void;
  fitCounter?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const view = viewport ?? planViewportExtent(model.sideM);
  const half = model.sideM / 2;
  const buildings = useMemo(() => figureGroundModelPaths(model.buildings, model.sideM), [model]);
  const cells = useMemo(() => {
    const cutRing = cutSquareRing(model.sideM);
    const cut = { ring: cutRing, holes: [] as [number, number][][] };
    const hits: { d: string; opacity: number }[] = [];
    let maxPop = 0;
    for (const unit of units) {
      maxPop = Math.max(maxPop, unit.population);
    }
    for (const unit of units) {
      const local = unit.ring.map(([lon, lat]) => toLocal(lat, lon, model.center));
      const overlap = intersectionAreaM2({ ring: local, holes: [] }, cut);
      if (overlap <= 0) continue;
      const d =
        local.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ") + " Z";
      hits.push({ d, opacity: sa1FillOpacity(unit, maxPop) });
    }
    return hits;
  }, [model.center, model.sideM, units]);

  const frameD = useMemo(() => {
    const ring = cutSquareRing(model.sideM);
    return ring.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ") + " Z";
  }, [model.sideM]);

  const accent = getColour("--demographics-cut-frame");
  const cellFill = getColour("--demographics-cell-fill");
  const mapBg = getColour("--demographics-map-bg");
  const buildingFill = getColour("--demographics-building-fill");

  return (
    <svg
      ref={svgRef}
      className="plan demographics-plan"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      role="img"
      aria-label="Demographics map for the cut"
      onPointerDown={(event) => {
        if (!onViewportChange) return;
        const start = { x: event.clientX, y: event.clientY, view: { ...view } };
        const move = (moveEvent: PointerEvent) => {
          const el = svgRef.current;
          if (!el) return;
          const scale = view.w / el.clientWidth;
          onViewportChange({
            ...start.view,
            x: start.view.x - (moveEvent.clientX - start.x) * scale,
            y: start.view.y - (moveEvent.clientY - start.y) * scale,
          });
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      data-fit-counter={fitCounter}
    >
      <rect x={-half} y={-half} width={model.sideM} height={model.sideM} fill={mapBg} />
      {cells.map((cell, index) => (
        <path key={index} d={cell.d} fill={cellFill} fillOpacity={cell.opacity} />
      ))}
      {buildings.map((path, index) => (
        <path key={index} d={path} fill={buildingFill} />
      ))}
      <path d={frameD} fill="none" stroke={accent} strokeWidth={screenPx(0.35)} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function screenPx(mm: number): number {
  return mm * 3.78;
}
