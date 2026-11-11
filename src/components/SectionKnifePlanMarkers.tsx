import { useLayoutEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import { sectionPlanMarkerClip, sectionPlanMarkerGeometry } from "../lib/sectionKnife/marker";
import {
  knifeMarkerLetter,
  planMarkerPalette,
  PLAN_MARKER_ARROW_LEN_PX,
  PLAN_MARKER_BUBBLE_DIAM_PX,
  PLAN_MARKER_BUBBLE_STROKE_PX,
  PLAN_MARKER_DASH_CSS,
  PLAN_MARKER_END_SEG_LEN_PX,
  PLAN_MARKER_END_SEG_SW_PX,
  PLAN_MARKER_GOLD_UNDERLAY_PX,
  PLAN_MARKER_LABEL_PX,
  PLAN_MARKER_LINE_SW_PX,
  sectionPlanMarkerEnds,
} from "../lib/sectionKnife/planMarkerDraw";
import type { SectionKnifeToolState } from "../lib/sectionKnife/state";
import type { CityModel } from "../types";

function viewArrowPointsPx(viewEast: number, viewNorthSvg: number, len = PLAN_MARKER_ARROW_LEN_PX): string {
  const vlen = Math.hypot(viewEast, viewNorthSvg) || 1;
  const ve = viewEast / vlen;
  const vn = viewNorthSvg / vlen;
  const wing = len * 0.52;
  const baseX = ve * (PLAN_MARKER_BUBBLE_DIAM_PX * 0.5 + 1.2);
  const baseY = vn * (PLAN_MARKER_BUBBLE_DIAM_PX * 0.5 + 1.2);
  const tipX = baseX + ve * len;
  const tipY = baseY + vn * len;
  const px = -vn;
  const py = ve;
  const lx = baseX - ve * wing * 0.35 + px * wing * 0.5;
  const ly = baseY - vn * wing * 0.35 + py * wing * 0.5;
  const rx = baseX - ve * wing * 0.35 - px * wing * 0.5;
  const ry = baseY - vn * wing * 0.35 - py * wing * 0.5;
  return `${lx},${ly} ${tipX},${tipY} ${rx},${ry}`;
}

function MarkerEndGraphic({
  cx,
  cy,
  pxScale,
  label,
  labelKey,
  viewEast,
  viewNorthSvg,
  palette,
}: {
  cx: number;
  cy: number;
  pxScale: number;
  label: string;
  labelKey: "A" | "Aprime";
  viewEast: number;
  viewNorthSvg: number;
  palette: ReturnType<typeof planMarkerPalette>;
}) {
  const r = PLAN_MARKER_BUBBLE_DIAM_PX * 0.5;
  return (
    <g transform={`translate(${cx}, ${cy}) scale(${pxScale})`}>
      <polygon
        className="section-knife-marker-arrow"
        data-section-knife-marker-arrow="1"
        points={viewArrowPointsPx(viewEast, viewNorthSvg)}
        fill={palette.ink}
        stroke="none"
      />
      <circle
        className="section-knife-marker-bubble"
        data-section-knife-marker-bubble="1"
        cx={0}
        cy={0}
        r={r}
        fill={palette.bubbleFill}
        stroke={palette.ink}
        strokeWidth={PLAN_MARKER_BUBBLE_STROKE_PX}
        vectorEffect="non-scaling-stroke"
      />
      <text
        className="mono section-knife-marker-end-label"
        data-section-knife-marker-end-label={labelKey}
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={PLAN_MARKER_LABEL_PX}
        fontWeight={700}
        fill={palette.ink}
      >
        {label}
      </text>
    </g>
  );
}

export function SectionKnifePlanMarkers({
  model,
  tool,
  svgRef,
  viewWidthM,
}: {
  model: CityModel;
  tool: SectionKnifeToolState;
  svgRef: RefObject<SVGSVGElement | null>;
  viewWidthM: number;
}) {
  const [, setScaleTick] = useState(0);
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScaleTick((t: number) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [svgRef]);
  const planWidthPx = Math.max(svgRef.current?.getBoundingClientRect().width ?? 1, 1);
  const metresPerCssPx = viewWidthM / planWidthPx;
  const pxScale = metresPerCssPx * 2;
  const markers = useMemo(() => {
    if (!tool.active) return [];
    return tool.knives.map((knife) => {
      const geom = sectionPlanMarkerGeometry(model, knife.pose);
      const clip = sectionPlanMarkerClip(model, geom);
      const ends = sectionPlanMarkerEnds(geom, clip, metresPerCssPx);
      return {
        knife,
        geom,
        ends,
        selected: knife.id === tool.selectedId,
      };
    });
  }, [model, tool, metresPerCssPx]);
  if (markers.length === 0) return null;
  const segHalfM = PLAN_MARKER_END_SEG_LEN_PX * 0.5 * metresPerCssPx;
  const viewNorthSvg = (geom: (typeof markers)[0]["geom"]) => -geom.viewNorth;

  return (
    <g className="section-knife-plan-markers" data-section-knife-plan-markers="1">
      {markers.map(({ knife, geom, ends, selected }) => {
        const palette = planMarkerPalette(selected);
        const clip = ends.clip;
        const x0 = clip.east0;
        const y0 = -clip.north0;
        const x1 = clip.east1;
        const y1 = -clip.north1;
        const te = geom.tangentEast;
        const tn = -geom.tangentNorth;
        const bx0 = ends.bubble0East;
        const by0 = -ends.bubble0North;
        const bx1 = ends.bubble1East;
        const by1 = -ends.bubble1North;
        const letter = knifeMarkerLetter(knife.label);
        const vn = viewNorthSvg(geom);
        return (
          <g key={knife.id} data-section-knife-marker-id={knife.id}>
            {palette.showGoldUnderlay ? (
              <path
                className="section-knife-marker-gold-underlay"
                d={`M ${x0} ${y0} L ${x1} ${y1}`}
                fill="none"
                stroke={palette.gold}
                strokeWidth={PLAN_MARKER_GOLD_UNDERLAY_PX}
                strokeLinecap="square"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <path
              className="section-knife-marker-dash-line"
              d={`M ${x0} ${y0} L ${x1} ${y1}`}
              fill="none"
              stroke={palette.ink}
              strokeWidth={PLAN_MARKER_LINE_SW_PX}
              strokeDasharray={PLAN_MARKER_DASH_CSS}
              strokeLinecap="square"
              vectorEffect="non-scaling-stroke"
            />
            {[
              [x0, y0],
              [x1, y1],
            ].map(([ex, ey], i) => (
              <path
                key={i}
                className="section-knife-marker-end-seg"
                d={`M ${ex - te * segHalfM} ${ey - tn * segHalfM} L ${ex + te * segHalfM} ${ey + tn * segHalfM}`}
                fill="none"
                stroke={palette.ink}
                strokeWidth={PLAN_MARKER_END_SEG_SW_PX}
                strokeLinecap="square"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <MarkerEndGraphic
              cx={bx0}
              cy={by0}
              pxScale={pxScale}
              label={letter}
              labelKey="A"
              viewEast={geom.viewEast}
              viewNorthSvg={vn}
              palette={palette}
            />
            <MarkerEndGraphic
              cx={bx1}
              cy={by1}
              pxScale={pxScale}
              label={`${letter}′`}
              labelKey="Aprime"
              viewEast={geom.viewEast}
              viewNorthSvg={vn}
              palette={palette}
            />
          </g>
        );
      })}
      {tool.snapCue && tool.snapCue.untilMs > Date.now() ? (
        <circle
          className="section-knife-snap-cue"
          data-section-knife-snap-cue="1"
          cx={tool.snapCue.east}
          cy={-tool.snapCue.north}
          r={10 * metresPerCssPx}
          fill="none"
          stroke={planMarkerPalette(true).gold}
          strokeWidth={1}
          strokeDasharray="3 2"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </g>
  );
}
