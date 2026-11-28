import { useEffect, useState, type RefObject } from "react";
import { getColour } from "../lib/colours";
import { measureLabelText } from "../lib/landmarkLabelText";
import {
  LANDMARK_FONT_PX,
  LANDMARK_HALO_PX,
  LANDMARK_LABEL_SETTLE_MS,
  placeLandmarkLabels,
  type LandmarkLabelSource,
} from "../lib/landmarkLabels";
import type { PlanViewport } from "../lib/planViewport";
import { hudObstacles } from "./LandmarkLabelLayer";

type Layout = { pxPerM: number; shown: ReadonlySet<number> };

export function DrawingLandmarkLabels({
  labels,
  view,
  svgRef,
}: {
  labels: readonly LandmarkLabelSource[];
  view: PlanViewport;
  svgRef: RefObject<SVGSVGElement | null>;
}) {
  const [layout, setLayout] = useState<Layout | null>(null);

  useEffect(() => {
    if (labels.length === 0) return;
    const timer = setTimeout(() => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const scale = Math.min(rect.width / view.w, rect.height / view.h);
      const offsetX = rect.left + (rect.width - view.w * scale) / 2;
      const offsetY = rect.top + (rect.height - view.h * scale) / 2;
      const candidates = labels.map((label) => ({
        id: label.buildingId,
        name: label.name,
        rank: label.rank,
        x: offsetX + (label.at[0] - view.x) * scale,
        y: offsetY + (-label.at[1] - view.y) * scale,
        width: measureLabelText(label.name) + LANDMARK_HALO_PX * 2,
        height: LANDMARK_FONT_PX * 1.3 + LANDMARK_HALO_PX * 2,
      }));
      const frame = svg.querySelector("[data-cut-frame]")?.getBoundingClientRect() ?? rect;
      const placed = placeLandmarkLabels(candidates, hudObstacles(), {
        bounds: {
          left: Math.max(rect.left, frame.left),
          top: Math.max(rect.top, frame.top),
          right: Math.min(rect.right, frame.right),
          bottom: Math.min(rect.bottom, frame.bottom),
        },
      });
      setLayout({ pxPerM: scale, shown: new Set(placed.map((label) => label.id)) });
    }, LANDMARK_LABEL_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [labels, view.x, view.y, view.w, view.h, svgRef]);

  if (labels.length === 0 || !layout) return null;
  const metres = (px: number) => px / layout.pxPerM;
  const ink = getColour("--landmark-label");
  const halo = getColour("--landmark-label-halo");
  return (
    <g className="plan-landmark-labels" data-landmark-labels="drawing">
      {labels.map((label) => (
        <text
          key={label.buildingId}
          className={layout.shown.has(label.buildingId) ? "plan-landmark-label is-visible" : "plan-landmark-label"}
          x={label.at[0]}
          y={-label.at[1]}
          fontSize={metres(LANDMARK_FONT_PX)}
          textAnchor="middle"
          dominantBaseline="central"
          fill={ink}
          stroke={halo}
          strokeWidth={metres(LANDMARK_HALO_PX * 2)}
          strokeLinejoin="round"
          paintOrder="stroke"
          data-building-id={label.buildingId}
        >
          <title>{label.name}</title>
          {label.name}
        </text>
      ))}
    </g>
  );
}
