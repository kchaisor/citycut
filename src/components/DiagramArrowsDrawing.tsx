import { useEffect, useMemo, useRef, type Dispatch, type RefObject } from "react";
import type { CityModel, Pt } from "../types";
import { getColour } from "../lib/colours";
import {
  ARROW_COLOUR_TOKENS,
  arrowLabelAnchor,
  buildArrowShape,
  hitArrow,
  nearestPointIndex,
  ribbonPolygon,
  smoothArrowPath,
  visibleInDrawing,
  type ArrowShape,
  type DiagramArrow,
} from "../lib/diagramArrows";
import {
  animatedArrows,
  animatedArrowShape,
  arrowClockSeconds,
  lightenArrowColour,
  publishArrowAnimation,
  useArrowMotionStopped,
  useArrowTicker,
} from "../lib/diagramArrowsMotion";
import {
  arrowToolClickActions,
  isDoubleClick,
  selectedArrow,
  type ArrowToolAction,
  type ArrowToolState,
  type ClickStamp,
} from "../lib/diagramArrowsTool";
import { LANDMARK_FONT_PX, LANDMARK_HALO_PX } from "../lib/landmarkLabels";
import { useColourRevision } from "../lib/useColourRevision";

const HIT_PX = 10;
const HANDLE_PX = 5;

function svgPoints(points: readonly Pt[]): string {
  return points.map(([east, north]) => `${east},${-north}`).join(" ");
}

export function ArrowShapePolygons({ shape, fill, opacity = 1 }: { shape: ArrowShape; fill: string; opacity?: number }) {
  return (
    <>
      {shape.ribbons.map((ribbon, index) => (
        <polygon key={`r${index}`} points={svgPoints(ribbonPolygon(ribbon))} fill={fill} fillOpacity={opacity} />
      ))}
      {shape.heads.map((head, index) => (
        <polygon key={`h${index}`} points={svgPoints(head)} fill={fill} fillOpacity={opacity} />
      ))}
    </>
  );
}

export function ArrowStyleSwatch({ style, colour }: Pick<DiagramArrow, "style" | "colour">) {
  const shape = useMemo(
    () =>
      buildArrowShape(
        [
          [0, 0],
          [60, 0],
        ],
        style,
        "m",
        900,
      ),
    [style],
  );
  const tick = useColourRevision();
  return (
    <svg className="arrow-swatch" viewBox="-6 -8 72 16" width="48" height="16" aria-hidden="true" data-tick={tick}>
      <ArrowShapePolygons shape={shape} fill={getColour(ARROW_COLOUR_TOKENS[colour])} />
    </svg>
  );
}

function clientToGround(svg: SVGSVGElement, clientX: number, clientY: number): Pt | null {
  const ctm = svg.getScreenCTM?.();
  if (!ctm) return null;
  const local = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return [local.x, -local.y];
}

export function useDrawingArrowClicks({
  state,
  dispatch,
  svgRef,
  viewWidthM,
}: {
  state: ArrowToolState;
  dispatch: Dispatch<ArrowToolAction>;
  svgRef: RefObject<SVGSVGElement | null>;
  viewWidthM: number;
}) {
  const last = useRef<ClickStamp | null>(null);
  return (clientX: number, clientY: number): boolean => {
    const svg = svgRef.current;
    if (!state.active || !svg) return false;
    const ground = clientToGround(svg, clientX, clientY);
    if (!ground) return false;
    const rect = svg.getBoundingClientRect();
    const mPerPx = viewWidthM / Math.max(1, rect.width);
    const stamp = { t: performance.now(), x: clientX, y: clientY };
    const double = isDoubleClick(last.current, stamp);
    last.current = stamp;
    let hit: { id: string; point: number | null } | null = null;
    const current = selectedArrow(state);
    if (current && state.visible) {
      const point = nearestPointIndex(current.points, ground, HIT_PX * mPerPx);
      if (point !== null) hit = { id: current.id, point };
    }
    if (!hit && state.visible) {
      const id = hitArrow(visibleInDrawing(state.arrows), ground, HIT_PX * mPerPx);
      if (id) hit = { id, point: null };
    }
    for (const action of arrowToolClickActions(state, { ground, hit }, double)) dispatch(action);
    return true;
  };
}

export function DiagramArrowsDrawing({
  model,
  state,
  dispatch,
  svgRef,
  viewWidthM,
  viewHeightM,
  hover,
}: {
  model: CityModel;
  state: ArrowToolState;
  dispatch: Dispatch<ArrowToolAction>;
  svgRef: RefObject<SVGSVGElement | null>;
  viewWidthM: number;
  viewHeightM: number;
  hover: Pt | null;
}) {
  const colourTick = useColourRevision();
  const arrows = useMemo(() => (state.visible ? visibleInDrawing(state.arrows) : []), [state.visible, state.arrows]);
  const rect = svgRef.current?.getBoundingClientRect();
  const mPerPx = Math.max(viewWidthM / Math.max(1, rect?.width || 1200), viewHeightM / Math.max(1, rect?.height || 800));
  const shapes = useMemo(
    () => arrows.map((arrow) => ({ arrow, shape: buildArrowShape(arrow.points, arrow.style, arrow.width, model.sideM, mPerPx) })),
    [arrows, model.sideM, mPerPx],
  );
  const reducedMotion = useArrowMotionStopped();
  const animated = useMemo(() => animatedArrows(arrows, reducedMotion), [arrows, reducedMotion]);
  useArrowTicker(animated.length > 0);
  useEffect(() => {
    if (animated.length === 0) return;
    return publishArrowAnimation(animated.length);
  }, [animated.length]);
  const seconds = arrowClockSeconds();
  const draft = state.visible && state.active ? state.draft : null;
  const draftPoints = draft && hover ? [...draft, hover] : draft;
  const draftShape =
    draftPoints && draftPoints.length >= 2
      ? buildArrowShape(draftPoints, state.defaults.style, state.defaults.width, model.sideM, mPerPx)
      : null;
  const selected = state.active ? selectedArrow(state) : null;
  const pxM = mPerPx;

  function startDrag(event: React.PointerEvent<SVGCircleElement>, id: string, index: number) {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dispatch({ type: "select", id, point: index });
  }

  function moveDrag(event: React.PointerEvent<SVGCircleElement>, id: string, index: number) {
    if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
    event.stopPropagation();
    const svg = svgRef.current;
    const ground = svg ? clientToGround(svg, event.clientX, event.clientY) : null;
    if (ground) dispatch({ type: "movePoint", id, index, point: ground });
  }

  if (shapes.length === 0 && !draftShape && !draft) return null;
  const fontSize = LANDMARK_FONT_PX * pxM;
  const ink = getColour("--landmark-label");
  const halo = getColour("--landmark-label-halo");
  return (
    <g className="diagram-arrows" data-tick={colourTick} data-arrows-drawing={arrows.length}>
      {shapes.map(({ arrow, shape }) => {
        const fill = getColour(ARROW_COLOUR_TOKENS[arrow.colour]);
        if (!animated.includes(arrow)) {
          return (
            <g key={arrow.id} data-arrow-id={arrow.id}>
              <ArrowShapePolygons shape={shape} fill={fill} />
            </g>
          );
        }
        const live = animatedArrowShape(arrow, model.sideM, mPerPx, seconds);
        return (
          <g key={arrow.id} data-arrow-id={arrow.id} data-arrow-animation={arrow.animation}>
            <ArrowShapePolygons shape={arrow.animation === "streaks" ? shape : live.body} fill={fill} />
            {live.streaks.length > 0 ? (
              <ArrowShapePolygons shape={{ ribbons: live.streaks, heads: [] }} fill={lightenArrowColour(fill).getStyle()} opacity={0.9} />
            ) : null}
          </g>
        );
      })}
      <g className="plan-landmark-labels" data-arrow-labels="drawing">
        {arrows.map((arrow) => {
          if (!arrow.label) return null;
          const [east, north] = arrowLabelAnchor(arrow.points);
          return (
            <text
              key={arrow.id}
              className="plan-landmark-label is-visible"
              data-arrow-label={arrow.id}
              x={east}
              y={-north - fontSize * 1.1}
              fontSize={fontSize}
              textAnchor="middle"
              dominantBaseline="central"
              fill={ink}
              stroke={halo}
              strokeWidth={LANDMARK_HALO_PX * 2 * pxM}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {arrow.label}
            </text>
          );
        })}
      </g>
      {draftShape ? <ArrowShapePolygons shape={draftShape} fill={getColour(ARROW_COLOUR_TOKENS[state.defaults.colour])} opacity={0.65} /> : null}
      {draft?.map(([east, north], index) => (
        <circle key={`d${index}`} cx={east} cy={-north} r={HANDLE_PX * pxM * 0.7} fill={getColour("--arrow-ink")} />
      ))}
      {selected && state.visible && selected.showInDrawing && smoothArrowPath(selected.points).length > 1
        ? selected.points.map(([east, north], index) => (
            <circle
              key={`p${index}`}
              data-arrow-point={index}
              cx={east}
              cy={-north}
              r={HANDLE_PX * pxM}
              fill={getColour(state.selectedPoint === index ? "--arrow-handle" : "--arrow-ink")}
              style={{ cursor: "grab" }}
              onPointerDown={(event) => startDrag(event, selected.id, index)}
              onPointerMove={(event) => moveDrag(event, selected.id, index)}
              onPointerUp={(event) => event.stopPropagation()}
            />
          ))
        : null}
    </g>
  );
}
