import { useMemo } from "react";
import { sectionPlanMarkerGeometry } from "../lib/sectionKnife/marker";
import {
  knifeMarkerLetter,
  planMarkerBubbleRadiusM,
  planMarkerInk,
  PLAN_MARKER_ARROW_PX,
  PLAN_MARKER_END_TICK_PX,
  viewArrowTriangleEn,
} from "../lib/sectionKnife/planMarkerDraw";
import type { SectionKnifeToolState } from "../lib/sectionKnife/state";
import type { CityModel } from "../types";
import { screenPx } from "../lib/lineweights";

export function SectionKnifePlanMarkers({
  model,
  tool,
  metresPerCssPx,
}: {
  model: CityModel;
  tool: SectionKnifeToolState;
  metresPerCssPx: number;
}) {
  const markers = useMemo(() => {
    if (!tool.active) return [];
    return tool.knives.map((knife) => ({
      knife,
      geom: sectionPlanMarkerGeometry(model, knife.pose),
      selected: knife.id === tool.selectedId,
    }));
  }, [model, tool]);
  if (markers.length === 0) return null;
  const bubbleR = planMarkerBubbleRadiusM(metresPerCssPx);
  const tickLen = PLAN_MARKER_END_TICK_PX * metresPerCssPx;
  const dash = `${screenPx(16)} ${screenPx(4)}`;
  const fontPx = screenPx(11);
  const labelOffset = bubbleR * 0.15;

  return (
    <g className="section-knife-plan-markers" data-section-knife-plan-markers="1">
      {markers.map(({ knife, geom, selected }) => {
        const ink = planMarkerInk(selected);
        const sw = selected ? screenPx(1.45) : screenPx(1.25);
        const x0 = geom.east0;
        const y0 = -geom.north0;
        const x1 = geom.east1;
        const y1 = -geom.north1;
        const te = geom.tangentEast;
        const tn = -geom.tangentNorth;
        const perpE = -tn;
        const perpN = te;
        const letter = knifeMarkerLetter(knife.label);
        const arrow0 = viewArrowTriangleEn(geom, geom.east0, geom.north0, metresPerCssPx, false);
        const arrow1 = viewArrowTriangleEn(geom, geom.east1, geom.north1, metresPerCssPx, false);
        return (
          <g key={knife.id} data-section-knife-marker-id={knife.id} opacity={selected ? 1 : 0.88}>
            <path
              d={`M ${x0} ${y0} L ${x1} ${y1}`}
              fill="none"
              stroke={ink.line}
              strokeWidth={sw}
              strokeDasharray={dash}
              strokeLinecap="square"
              vectorEffect="non-scaling-stroke"
            />
            {[
              [x0, y0],
              [x1, y1],
            ].map(([ex, ey], i) => (
              <path
                key={i}
                d={`M ${ex - perpE * tickLen} ${ey - perpN * tickLen} L ${ex + perpE * tickLen} ${ey + perpN * tickLen}`}
                fill="none"
                stroke={ink.line}
                strokeWidth={sw * 1.65}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <polygon points={arrow0} fill={ink.line} stroke="none" vectorEffect="non-scaling-stroke" />
            <polygon points={arrow1} fill={ink.line} stroke="none" vectorEffect="non-scaling-stroke" />
            <circle
              className="section-knife-marker-bubble"
              data-section-knife-marker-bubble="1"
              cx={x0}
              cy={y0}
              r={bubbleR}
              fill={ink.fill}
              stroke={ink.line}
              strokeWidth={screenPx(0.9)}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              className="section-knife-marker-bubble"
              data-section-knife-marker-bubble="1"
              cx={x1}
              cy={y1}
              r={bubbleR}
              fill={ink.fill}
              stroke={ink.line}
              strokeWidth={screenPx(0.9)}
              vectorEffect="non-scaling-stroke"
            />
            <text
              className="mono section-knife-marker-end-label"
              data-section-knife-marker-end-label="A"
              x={x0}
              y={y0 + labelOffset}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontPx}
              vectorEffect="non-scaling-stroke"
              fill={ink.text}
            >
              {letter}
            </text>
            <text
              className="mono section-knife-marker-end-label"
              data-section-knife-marker-end-label="Aprime"
              x={x1}
              y={y1 + labelOffset}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontPx}
              vectorEffect="non-scaling-stroke"
              fill={ink.text}
            >
              {letter}′
            </text>
          </g>
        );
      })}
      {tool.snapCue && tool.snapCue.untilMs > Date.now() ? (
        <circle
          className="section-knife-snap-cue"
          data-section-knife-snap-cue="1"
          cx={tool.snapCue.east}
          cy={-tool.snapCue.north}
          r={PLAN_MARKER_ARROW_PX * metresPerCssPx}
          fill="none"
          stroke={planMarkerInk(true).line}
          strokeWidth={screenPx(1)}
          strokeDasharray={`${screenPx(3)} ${screenPx(2)}`}
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </g>
  );
}
