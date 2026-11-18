import { useMemo, useRef, useState, type RefObject } from "react";
import { getColour } from "../lib/colours";
import { screenPx } from "../lib/lineweights";
import { svgRings } from "../lib/svgPlan";
import { SUN_STUDY_SHADOW_ADDED_OPACITY } from "../lib/sunStudyPlan";
import { ringFromCorners } from "../lib/solarAccessB43";
import type { PlanViewport } from "../lib/planViewport";
import { isParkAssessRow, type SolarAssessRow, type SolarReceptorArea } from "../lib/solarReceptorAssess";
import type { Pt, Ring } from "../types";

export const ADDED_SHADOW_HATCH_ID = "sun-study-added-hatch";
export const ADDED_SHADOW_HATCH_FILL = `url(#${ADDED_SHADOW_HATCH_ID})`;

type ParkPlanOverlay = {
  id: string;
  ring: Ring;
  hatch: Ring[][];
};

function ringCentroid(ring: Ring): [number, number] {
  let sumE = 0;
  let sumN = 0;
  const count = Math.max(1, ring.length - 1);
  for (let index = 0; index < count; index++) {
    const [east, north] = ring[index]!;
    sumE += east;
    sumN += north;
  }
  return [sumE / count, sumN / count];
}

export function planPointFromClient(svg: SVGSVGElement, clientX: number, clientY: number, planView: PlanViewport): Pt {
  const ctm = svg.getScreenCTM?.();
  if (ctm) {
    const local = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return [local.x, -local.y];
  }
  const rect = svg.getBoundingClientRect();
  const x = planView.x + ((clientX - rect.left) / rect.width) * planView.w;
  const y = planView.y + ((clientY - rect.top) / rect.height) * planView.h;
  return [x, -y];
}

export function usePlanReceptorDraw(svgRef: RefObject<SVGSVGElement | null>) {
  const drag = useRef<{ a: Pt; b: Pt } | null>(null);
  const [preview, setPreview] = useState<Ring | null>(null);
  const pointAt = (clientX: number, clientY: number, view: PlanViewport): Pt =>
    svgRef.current ? planPointFromClient(svgRef.current, clientX, clientY, view) : [0, 0];
  return {
    preview,
    begin(clientX: number, clientY: number, view: PlanViewport) {
      const at = pointAt(clientX, clientY, view);
      drag.current = { a: at, b: at };
      setPreview(ringFromCorners(at, at));
    },
    move(clientX: number, clientY: number, view: PlanViewport): boolean {
      const draw = drag.current;
      if (!draw) return false;
      draw.b = pointAt(clientX, clientY, view);
      setPreview(ringFromCorners(draw.a, draw.b));
      return true;
    },
    end(onCommit: (ring: Ring) => void): boolean {
      const draw = drag.current;
      if (!draw) return false;
      drag.current = null;
      setPreview(null);
      const width = Math.abs(draw.a[0] - draw.b[0]);
      const height = Math.abs(draw.a[1] - draw.b[1]);
      if (width >= 2 && height >= 2) onCommit(ringFromCorners(draw.a, draw.b));
      return true;
    },
  };
}

export function usePlanSolarReceptors(
  solarReceptors: readonly SolarReceptorArea[],
  solarReceptorResults: readonly SolarAssessRow[],
) {
  const resultById = useMemo(
    () => new Map(solarReceptorResults.map((row) => [row.id, row])),
    [solarReceptorResults],
  );
  const parkOverlays = useMemo<ParkPlanOverlay[]>(
    () =>
      solarReceptors
        .filter((receptor) => (receptor.kind ?? "yard") === "park")
        .map((receptor) => {
          const row = resultById.get(receptor.id);
          return { id: receptor.id, ring: receptor.ring, hatch: row && isParkAssessRow(row) ? row.addedShadowRings : [] };
        }),
    [solarReceptors, resultById],
  );
  return { resultById, parkOverlays, hasParkHatch: parkOverlays.some((overlay) => overlay.hatch.length > 0) };
}

export function PlanAddedShadowDefs({
  hatchSize,
  parkOverlays,
}: {
  hatchSize: number;
  parkOverlays: readonly ParkPlanOverlay[];
}) {
  const addedFill = getColour("--sun-study-shadow-added");
  return (
    <defs>
      <pattern
        id={ADDED_SHADOW_HATCH_ID}
        patternUnits="userSpaceOnUse"
        width={hatchSize}
        height={hatchSize}
        patternTransform="rotate(45)"
      >
        <rect width={hatchSize} height={hatchSize} fill={addedFill} fillOpacity={SUN_STUDY_SHADOW_ADDED_OPACITY * 0.62} />
        <line x1={0} y1={0} x2={0} y2={hatchSize} stroke={addedFill} strokeWidth={hatchSize * 0.38} />
        <line
          x1={hatchSize * 0.45}
          y1={0}
          x2={hatchSize * 0.45}
          y2={hatchSize}
          stroke={addedFill}
          strokeWidth={hatchSize * 0.22}
        />
      </pattern>
      {parkOverlays.map((overlay) =>
        overlay.hatch.length > 0 ? (
          <clipPath key={`park-clip-${overlay.id}`} id={`solar-park-clip-${overlay.id}`}>
            <path d={svgRings([overlay.ring])} fillRule="evenodd" />
          </clipPath>
        ) : null,
      )}
    </defs>
  );
}

export function PlanSolarReceptorLayer({
  receptors,
  resultById,
  parkOverlays,
  preview,
  hatchSize,
  canvas,
  labelSizeM,
}: {
  receptors: readonly SolarReceptorArea[];
  resultById: ReadonlyMap<string, SolarAssessRow>;
  parkOverlays: readonly ParkPlanOverlay[];
  preview: Ring | null;
  hatchSize: number;
  canvas: string;
  labelSizeM: number;
}) {
  const addedFill = getColour("--sun-study-shadow-added");
  const outline = getColour("--solar-receptor-outline");
  const toneFill = {
    pass: getColour("--solar-receptor-pass"),
    fail: getColour("--solar-receptor-fail"),
    warn: getColour("--solar-receptor-warn"),
  };
  return (
    <>
      {parkOverlays.map((overlay) =>
        overlay.hatch.length > 0 ? (
          <g
            key={`park-hatch-${overlay.id}`}
            clipPath={`url(#solar-park-clip-${overlay.id})`}
            data-solar-park-added-shadow={overlay.id}
          >
            {overlay.hatch.map((rings, index) => (
              <path
                key={index}
                d={svgRings(rings)}
                fill={ADDED_SHADOW_HATCH_FILL}
                fillRule="evenodd"
                stroke={addedFill}
                strokeWidth={Math.max(0.35, hatchSize * 0.16)}
                strokeLinejoin="round"
              />
            ))}
          </g>
        ) : null,
      )}
      {receptors.map((receptor) => {
        const row = resultById.get(receptor.id);
        const isPark = (receptor.kind ?? "yard") === "park";
        const [labelX, labelY] = ringCentroid(receptor.ring);
        return (
          <g key={`sr${receptor.id}`} data-solar-receptor-group={receptor.id}>
            <path
              data-solar-receptor-overlay={receptor.id}
              data-solar-park-receptor={isPark ? receptor.id : undefined}
              data-solar-receptor-status={row?.statusTone ?? "pass"}
              d={svgRings([receptor.ring])}
              fill={toneFill[row?.statusTone ?? "pass"]}
              fillOpacity={isPark ? 0.35 : 0.52}
              fillRule="evenodd"
              stroke={outline}
              strokeWidth={screenPx(isPark ? 0.6 : 0.35)}
              strokeDasharray={isPark ? "7 4" : undefined}
              vectorEffect="non-scaling-stroke"
            />
            {isPark && (
              <text
                data-solar-park-label={receptor.id}
                x={labelX}
                y={-labelY}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={labelSizeM}
                fontWeight={700}
                letterSpacing="0.06em"
                fill={outline}
                fontFamily="Geist, Helvetica, Arial, sans-serif"
                stroke={canvas}
                strokeWidth={screenPx(0.2)}
                paintOrder="stroke"
              >
                {receptor.id.replace(/-/g, " ").toUpperCase()}
              </text>
            )}
          </g>
        );
      })}
      {preview && (
        <path
          data-solar-receptor-preview
          d={svgRings([preview])}
          fill={getColour("--solar-receptor-preview")}
          fillOpacity={0.35}
          fillRule="evenodd"
          stroke={outline}
          strokeWidth={screenPx(0.35)}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </>
  );
}
