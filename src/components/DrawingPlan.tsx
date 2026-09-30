import { useEffect, useMemo, useRef, useState } from "react";
import { figureGroundModelPaths, scaleBarMetres } from "../lib/figureGround";
import {
  CONTOUR_COLOR,
  CONTOUR_DASH_MM,
  CONTOUR_GAP_MM,
  LINE_MM,
  screenDashPx,
  screenPx,
} from "../lib/lineweights";
import { planPaths, svgPolyline, svgRings } from "../lib/svgPlan";
import { themeColor } from "../lib/themeColor";
import type { CityModel } from "../types";

type View = { x: number; y: number; w: number; h: number };

export type DrawingKind = "site" | "figure-ground";

function fittedView(model: CityModel, kind: DrawingKind): View {
  const half = model.sideM / 2;
  if (kind === "site") {
    const pad = model.sideM * 0.045;
    const size = model.sideM + pad * 2;
    return { x: -half - pad, y: -half - pad, w: size, h: size };
  }
  const padX = model.sideM * 0.06;
  const padTop = model.sideM * 0.09;
  const padBottom = model.sideM * 0.11;
  return {
    x: -half - padX,
    y: -half - padTop,
    w: model.sideM + padX * 2,
    h: model.sideM + padTop + padBottom,
  };
}

export function DrawingPlan({
  model,
  kind = "site",
  onScale,
}: {
  model: CityModel;
  kind?: DrawingKind;
  onScale?: (widthM: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number; view: View } | null>(null);
  const figure = kind === "figure-ground";
  const paths = useMemo(() => (figure ? null : planPaths(model)), [figure, model]);
  const figurePaths = useMemo(
    () => (figure ? figureGroundModelPaths(model.buildings, model.sideM) : []),
    [figure, model],
  );
  const fitted = useMemo(() => fittedView(model, kind), [model, kind]);
  const [view, setView] = useState<View>(fitted);

  useEffect(() => {
    setView(fitted);
  }, [fitted]);

  useEffect(() => {
    onScale?.(view.w);
  }, [onScale, view.w]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const factor = Math.exp(pixels * 0.0012);
      setView((current) => {
        const w = current.w * factor;
        const h = current.h * factor;
        if (w < model.sideM * 0.04 || w > model.sideM * 6) return current;
        return {
          x: current.x + (current.w - w) * px,
          y: current.y + (current.h - h) * py,
          w,
          h,
        };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [model.sideM]);

  const half = model.sideM / 2;
  const empty = figure
    ? figurePaths.length === 0
    : model.buildings.length === 0 &&
      model.roads.length === 0 &&
      model.areas.length === 0 &&
      model.trees.length === 0 &&
      (paths?.contours.length ?? 0) === 0;
  const framePx = screenPx(LINE_MM.frame);
  const notePx = screenPx(LINE_MM.annotation);
  const barMetres = scaleBarMetres(model.sideM);
  const barThickness = Math.max(model.sideM * 0.005, 0.6);
  const barY = half + model.sideM * 0.028;
  const arrowX = half - model.sideM * 0.02;
  const arrowTip = -half - model.sideM * 0.055;
  const arrowBase = -half - model.sideM * 0.016;
  const head = model.sideM * 0.01;
  const canvas = useMemo(() => themeColor("--drawing-bg", "#EBEBEB"), []);

  return (
    <svg
      ref={svgRef}
      className={figure ? "plan figure-ground" : "plan"}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      role="img"
      aria-label={figure ? "Figure-ground plan" : "Vector site plan"}
      onDoubleClick={() => setView(fitted)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { px: event.clientX, py: event.clientY, view };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        const svg = svgRef.current;
        if (!start || !svg) return;
        const rect = svg.getBoundingClientRect();
        const dx = ((event.clientX - start.px) / rect.width) * start.view.w;
        const dy = ((event.clientY - start.py) / rect.height) * start.view.h;
        setView({ ...start.view, x: start.view.x - dx, y: start.view.y - dy });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={canvas} />
      <rect x={-half} y={-half} width={model.sideM} height={model.sideM} fill={canvas} />
      {figure ? (
        <>
          {figurePaths.map((d, index) => (
            <path key={`f${index}`} d={d} fill="#000" fillRule="evenodd" />
          ))}
          <rect
            x={-half}
            y={-half}
            width={model.sideM}
            height={model.sideM}
            fill="none"
            stroke="#000"
            strokeWidth={framePx}
            vectorEffect="non-scaling-stroke"
          />
          <g aria-hidden="true">
            <line
              x1={arrowX}
              y1={arrowBase}
              x2={arrowX}
              y2={arrowTip + head * 1.6}
              stroke="#000"
              strokeWidth={notePx}
              vectorEffect="non-scaling-stroke"
            />
            <polygon
              points={`${arrowX},${arrowTip} ${arrowX - head},${arrowTip + head * 1.7} ${arrowX + head},${arrowTip + head * 1.7}`}
              fill="#000"
            />
            <text
              x={arrowX + head * 1.5}
              y={arrowTip + head * 1.15}
              fontSize={model.sideM * 0.026}
              fill="#000"
              fontFamily="Helvetica, Arial, sans-serif"
            >
              N
            </text>
          </g>
          <g aria-hidden="true">
            <rect x={-half} y={barY} width={barMetres / 2} height={barThickness} fill="#000" />
            <rect
              x={-half}
              y={barY}
              width={barMetres}
              height={barThickness}
              fill="none"
              stroke="#000"
              strokeWidth={notePx}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={-half + barMetres + model.sideM * 0.012}
              y={barY + barThickness * 0.85}
              fontSize={model.sideM * 0.02}
              fill="#000"
              fontFamily="Helvetica, Arial, sans-serif"
            >
              {barMetres} m
            </text>
          </g>
        </>
      ) : (
        paths && (
          <>
            {paths.green.map((rings, index) => (
              <path key={`g${index}`} d={svgRings(rings)} fill="#b7d39a" />
            ))}
            {paths.water.map((rings, index) => (
              <path key={`w${index}`} d={svgRings(rings)} fill="#9ec9d1" />
            ))}
            {paths.contours.map((line, index) => (
              <path
                key={`c${index}`}
                d={svgPolyline(line, false)}
                fill="none"
                stroke={CONTOUR_COLOR}
                strokeWidth={screenPx(LINE_MM.contour)}
                strokeDasharray={`${screenDashPx(CONTOUR_DASH_MM)} ${screenDashPx(CONTOUR_GAP_MM)}`}
                strokeLinejoin="miter"
                strokeLinecap="butt"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {paths.rails.map((rail, index) => (
              <path
                key={`l${index}`}
                d={svgPolyline(rail.line, false)}
                fill="none"
                stroke={rail.stroke}
                strokeWidth={screenPx(LINE_MM.secondary)}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {paths.paths.map((path, index) => (
              <path
                key={`p${index}`}
                d={svgPolyline(path.line, false)}
                fill="none"
                stroke={path.stroke}
                strokeWidth={screenPx(LINE_MM.secondary)}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {paths.roadEdges.map((road, index) => (
              <path
                key={`r${index}`}
                d={svgPolyline(road.line, false)}
                fill="none"
                stroke={road.stroke}
                strokeWidth={screenPx(LINE_MM.propertyRoad)}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {paths.buildings.map((building, index) => (
              <path
                key={`b${index}`}
                d={svgRings(building.rings)}
                fill={building.fill}
                fillRule="evenodd"
                stroke="#1c1b17"
                strokeWidth={screenPx(LINE_MM.buildingCut)}
                strokeLinejoin="miter"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {paths.trees.map((tree, index) => (
              <circle
                key={`t${index}`}
                cx={tree.east}
                cy={-tree.north}
                r={tree.r}
                fill="#6ea35a"
                stroke="#245232"
                strokeWidth={screenPx(LINE_MM.secondary)}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <rect
              x={-half}
              y={-half}
              width={model.sideM}
              height={model.sideM}
              fill="none"
              stroke="#1c1b17"
              strokeWidth={framePx}
              vectorEffect="non-scaling-stroke"
            />
            <text x={0} y={-half + model.sideM * 0.04} textAnchor="middle" fontSize={model.sideM * 0.03} fill="#1c1b17">
              N
            </text>
          </>
        )
      )}
      {empty && (
        <text x={0} y={0} textAnchor="middle" fontSize={model.sideM * 0.04} fill="#6d675e">
          {figure ? "No building footprints in this frame" : "Nothing mapped in this frame"}
        </text>
      )}
    </svg>
  );
}
