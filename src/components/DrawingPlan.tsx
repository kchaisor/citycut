import { useEffect, useMemo, useRef, useState } from "react";
import {
  haloMm,
  footpathEdgeSvgAttrs,
  readDrawingStyle,
  screenPenAttrs,
  type LineStyles,
  type StrokeStyle,
} from "../lib/drawingStyle";
import { figureGroundModelPaths, scaleBarMetres } from "../lib/figureGround";
import { circleRing, DEFAULT_SITE_FRAME_SHAPE } from "../lib/siteFrame";
import { openRing } from "../lib/geo";
import { LINE_MM, screenPx } from "../lib/lineweights";
import { importedMassingStrokeStyle, planBuildingStrokeStyle } from "../lib/planBuildingFill";
import { planPaths, svgPolyline, svgRings } from "../lib/svgPlan";
import { getColour } from "../lib/colours";
import { themeColor } from "../lib/themeColor";
import { useColourRevision } from "../lib/useColourRevision";
import type { CityModel } from "../types";
import { HeliodonPlanOverlay } from "./HeliodonPlanOverlay";
import { NswPlanLabels, NswPlanLines, NswPlanUnder } from "./NswPlanLayers";
import { NSW_PLAN_LABEL_SHARE, nswPlanItems } from "../lib/nswPlan";
import { readNswPlanStyle } from "../lib/nswPlanStyle";
import { planShadowRings, type PlanShadowInput } from "../lib/buildingShadows";
import type { HeliodonDiagramInput } from "../lib/heliodonDiagram";
import { planViewportExtent, type PlanViewport } from "../lib/planViewport";
import { SUN_STUDY_SHADOW_OPACITY, SUN_STUDY_TREE_OPACITY, type SunStudyDate } from "../lib/sunStudyPlan";
import { useSunStudyShadows } from "./useSunStudyShadows";

export type DrawingKind = "site" | "figure-ground" | "exploded-axo";

function CasedLine({ d, stroke, paper }: { d: string; stroke: StrokeStyle; paper: string }) {
  if (!(stroke.mm > 0) || !d) return null;
  const halo = haloMm(stroke.mm);
  return (
    <g>
      {halo > stroke.mm && (
        <path
          d={d}
          fill="none"
          stroke={paper}
          strokeWidth={screenPx(halo)}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path d={d} fill="none" {...screenPenAttrs(stroke)} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

export function DrawingPlan({
  model,
  kind = "site",
  onScale,
  lineStyle,
  planScale = 1000,
  heliodon = null,
  castShadows = false,
  shadowInput = null,
  uniformBuildings = false,
  colourBySource = false,
  highlightManual = false,
  viewport,
  onViewportChange,
  fitCounter = 0,
  sunStudy = null,
  sunStudyMuted = false,
}: {
  model: CityModel;
  kind?: DrawingKind;
  onScale?: (widthM: number) => void;
  /** Resolved site-plan pens. Omit to read the current CSS cascade. */
  lineStyle?: LineStyles;
  /** Drawing drawer plan scale. 2500 and smaller thin metro 1 m contours to 5 m. */
  planScale?: number;
  /** When set, draws the sun path over the plan (same ring radius as the 3D heliodon). */
  heliodon?: HeliodonDiagramInput | null;
  castShadows?: boolean;
  shadowInput?: PlanShadowInput | null;
  uniformBuildings?: boolean;
  colourBySource?: boolean;
  highlightManual?: boolean;
  viewport?: PlanViewport;
  onViewportChange?: (view: PlanViewport) => void;
  fitCounter?: number;
  /** Site plan sun study: hourly 9am–3pm shadow layers, hourly suns, scale bar and north arrow. */
  sunStudy?: SunStudyDate | null;
  /** With the sun study on: draw the base plan in the quiet --sun-study-* fills. */
  sunStudyMuted?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number; view: PlanViewport } | null>(null);
  const figure = kind === "figure-ground";
  const style = lineStyle ?? readDrawingStyle();
  const plan = useMemo(
    () =>
      planPaths(
        model,
        style.pathWidthM,
        style.contourIndexEvery,
        planScale,
        style.contourCoarseIntervalM,
        style.contourCoarseFromScale,
        {
          buildingColour: {
            colourByUse: !uniformBuildings && !colourBySource,
            uniformBuildings,
            colourBySource,
          },
          highlightManual,
          pathFilletM: style.pathFilletM,
        },
      ),
    [
      model,
      style.pathWidthM,
      style.contourIndexEvery,
      style.contourCoarseIntervalM,
      style.contourCoarseFromScale,
      planScale,
      uniformBuildings,
      colourBySource,
      highlightManual,
      style.pathFilletM,
    ],
  );
  const frameShape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const figurePaths = useMemo(
    () => (figure ? figureGroundModelPaths(model.buildings, model.sideM, frameShape) : []),
    [figure, model, frameShape],
  );
  const fitted = useMemo(() => planViewportExtent(model.sideM), [model.sideM]);
  const [internalView, setInternalView] = useState<PlanViewport>(fitted);
  const view = viewport ?? internalView;
  const applyView = (next: PlanViewport | ((current: PlanViewport) => PlanViewport)) => {
    const resolved = typeof next === "function" ? next(viewport ?? internalView) : next;
    if (onViewportChange) onViewportChange(resolved);
    else setInternalView(resolved);
  };

  useEffect(() => {
    if (fitCounter > 0) applyView(fitted);
  }, [fitCounter, fitted]);

  useEffect(() => {
    if (viewport === undefined) setInternalView(fitted);
  }, [model.sideM, model.frameShape, fitted, viewport]);

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
      applyView((current) => {
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
  }, [model.sideM, view, internalView, onViewportChange]);

  const half = model.sideM / 2;
  const framePathD = useMemo(() => {
    const half = model.sideM / 2;
    if (frameShape === "circle") return svgPolyline(openRing(circleRing(half)), true);
    return `M ${-half} ${-half} L ${half} ${-half} L ${half} ${half} L ${-half} ${half} Z`;
  }, [frameShape, model.sideM]);

  const empty = figure
    ? figurePaths.length === 0
    : model.buildings.length === 0 &&
      model.roads.length === 0 &&
      model.areas.length === 0 &&
      model.trees.length === 0 &&
      plan.contours.length === 0;
  const framePx = screenPx(LINE_MM.frame);
  const notePx = screenPx(LINE_MM.annotation);
  const barMetres = scaleBarMetres(model.sideM);
  const barThickness = Math.max(model.sideM * 0.005, 0.6);
  const barY = half + model.sideM * 0.028;
  const arrowX = half - model.sideM * 0.02;
  const arrowTip = -half - model.sideM * 0.055;
  const arrowBase = -half - model.sideM * 0.016;
  const head = model.sideM * 0.01;
  const colourTick = useColourRevision();
  const canvas = useMemo(() => themeColor("--drawing-bg"), [colourTick]);
  const figureFill = getColour("--figure-fill");
  const blockFill = getColour("--block-plan");
  const greenFill = getColour("--green-fill");
  const waterFill = getColour("--water-fill");
  const treeFill = getColour("--tree-fill");
  const planEmpty = getColour("--plan-empty");
  const shadowFill = getColour("--shadow-fill");
  // NSW mode only: null on Victorian cuts, so nothing below renders for them.
  const nswStyle = useMemo(() => (model.nsw ? readNswPlanStyle() : null), [model.nsw, colourTick]);
  const nswItems = useMemo(() => (nswStyle ? nswPlanItems(model, nswStyle.hatchM) : null), [model, nswStyle]);
  const study = figure ? null : sunStudy;
  const studyShadows = useSunStudyShadows(model, study);
  const studyShadowFill = getColour("--sun-study-shadow");
  const muted = Boolean(study) && sunStudyMuted;
  const mutedFill = (key: Parameters<typeof getColour>[0], normal: string) => (muted ? getColour(key) : normal);
  const annotationInk = figure ? figureFill : getColour("--sun-compass-label");
  const shadowRings = useMemo(() => {
    if (!shadowInput || figure || study) return [];
    return planShadowRings(model, shadowInput, castShadows);
  }, [castShadows, figure, model, shadowInput, study]);
  const annotations = (
    <>
      <g aria-hidden="true" className="plan-north-arrow">
        <line
          x1={arrowX}
          y1={arrowBase}
          x2={arrowX}
          y2={arrowTip + head * 1.6}
          stroke={annotationInk}
          strokeWidth={notePx}
          vectorEffect="non-scaling-stroke"
        />
        <polygon
          points={`${arrowX},${arrowTip} ${arrowX - head},${arrowTip + head * 1.7} ${arrowX + head},${arrowTip + head * 1.7}`}
          fill={annotationInk}
        />
        <text
          x={arrowX + head * 1.5}
          y={arrowTip + head * 1.15}
          fontSize={model.sideM * 0.026}
          fill={annotationInk}
          fontFamily="Helvetica, Arial, sans-serif"
        >
          N
        </text>
      </g>
      <g aria-hidden="true" className="plan-scale-bar">
        <rect x={-half} y={barY} width={barMetres / 2} height={barThickness} fill={annotationInk} />
        <rect
          x={-half}
          y={barY}
          width={barMetres}
          height={barThickness}
          fill="none"
          stroke={annotationInk}
          strokeWidth={notePx}
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={-half + barMetres + model.sideM * 0.012}
          y={barY + barThickness * 0.85}
          fontSize={model.sideM * 0.02}
          fill={annotationInk}
          fontFamily="Helvetica, Arial, sans-serif"
        >
          {barMetres} m
        </text>
      </g>
    </>
  );

  return (
    <svg
      ref={svgRef}
      className={figure ? "plan figure-ground" : "plan"}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      role="img"
      aria-label={figure ? "Figure-ground plan" : "Vector site plan"}
      onDoubleClick={() => applyView(fitted)}
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
        const next = { ...start.view, x: start.view.x - dx, y: start.view.y - dy };
        if (onViewportChange) onViewportChange(next);
        else setInternalView(next);
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
            <path key={`f${index}`} d={d} fill={figureFill} fillRule="evenodd" />
          ))}
          <path
            d={framePathD}
            fill="none"
            stroke={figureFill}
            strokeWidth={framePx}
            vectorEffect="non-scaling-stroke"
          />
          {annotations}
        </>
      ) : (
        <>
            {plan.blocks.map((rings, index) => (
              <path key={`b${index}`} d={svgRings(rings)} fill={mutedFill("--sun-study-block", blockFill)} />
            ))}
            {nswItems && nswStyle && <NswPlanUnder items={nswItems} style={nswStyle} />}
            {plan.green.map((rings, index) => (
              <path key={`g${index}`} d={svgRings(rings)} fill={mutedFill("--sun-study-green", greenFill)} {...screenPenAttrs(style.green)} />
            ))}
            {plan.water.map((rings, index) => (
              <path key={`w${index}`} d={svgRings(rings)} fill={mutedFill("--sun-study-water", waterFill)} {...screenPenAttrs(style.water)} />
            ))}
            {plan.pathFill.length > 0 && (
              <path
                d={plan.pathFill.map((polygon) => svgRings(polygon)).join(" ")}
                fill={mutedFill("--sun-study-path", style.pathFill)}
                fillRule="evenodd"
                {...(muted
                  ? { stroke: getColour("--sun-study-path-edge"), strokeWidth: screenPx(0.1), vectorEffect: "non-scaling-stroke" as const }
                  : footpathEdgeSvgAttrs(style))}
              />
            )}
            {plan.contours.map((line, index) => (
              <path
                key={`c${index}`}
                d={svgPolyline(line, false)}
                fill="none"
                {...screenPenAttrs(
                  plan.contourIndex[index] ? { ...style.contour, mm: style.contourIndexMm } : style.contour,
                  "miter",
                )}
              />
            ))}
            {plan.roadFill.length > 0 && (
              <path
                d={plan.roadFill.map((polygon) => svgRings(polygon)).join(" ")}
                fill={mutedFill("--sun-study-road", style.roadFill)}
                fillRule="evenodd"
                {...(style.kerbOn ? screenPenAttrs(style.kerb) : { stroke: "none" })}
              />
            )}
            {plan.rails.map((rail, index) => (
              <CasedLine key={`l${index}`} d={svgPolyline(rail, false)} stroke={style.rail} paper={canvas} />
            ))}
            {plan.trams.map((tram, index) => (
              <path key={`tr${index}`} d={svgPolyline(tram, false)} fill="none" {...screenPenAttrs(style.tram)} strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {nswItems && nswStyle && <NswPlanLines items={nswItems} style={nswStyle} />}
            {study &&
              studyShadows.layers.map((layer) => (
                <g key={`ss${layer.hour}`} data-shadow-hour={layer.hour}>
                  {layer.rings.map((rings, index) => (
                    <path
                      key={index}
                      d={svgRings(rings)}
                      fill={studyShadowFill}
                      fillOpacity={SUN_STUDY_SHADOW_OPACITY}
                      fillRule="evenodd"
                      stroke="none"
                    />
                  ))}
                </g>
              ))}
            {shadowRings.map((rings, index) => (
              <path
                key={`sh${index}`}
                d={svgRings(rings)}
                fill={shadowFill}
                fillRule="evenodd"
                stroke="none"
              />
            ))}
            {plan.buildings.map((building, index) => (
              <path
                key={`b${index}`}
                d={svgRings(building.rings)}
                fill={muted && !building.site ? getColour("--sun-study-building") : building.fill}
                fillRule="evenodd"
                {...screenPenAttrs(
                  building.imported
                    ? importedMassingStrokeStyle(style)
                    : building.site
                      ? style.siteBuilding
                      : planBuildingStrokeStyle(style, uniformBuildings, false),
                  "miter",
                )}
              />
            ))}
            {(model.siteBoundaryLines ?? []).map((line, index) => (
              <path
                key={`sb${index}`}
                d={svgPolyline(line, false)}
                fill="none"
                {...screenPenAttrs(style.siteBoundary)}
              />
            ))}
            {plan.trees.map((tree, index) => (
              <circle
                key={`t${index}`}
                cx={tree.east}
                cy={-tree.north}
                r={tree.r}
                fill={mutedFill("--sun-study-tree", treeFill)}
                fillOpacity={muted ? SUN_STUDY_TREE_OPACITY : style.treeFillOpacity}
                {...screenPenAttrs(style.tree)}
              />
            ))}
            {nswItems && nswStyle && <NswPlanLabels items={nswItems} style={nswStyle} sizeM={model.sideM * NSW_PLAN_LABEL_SHARE} />}
            <path d={framePathD} fill="none" {...screenPenAttrs(style.frame, "miter")} />
            {heliodon && (
              <HeliodonPlanOverlay input={heliodon} planScale={planScale} sideM={model.sideM} sunStudy={study} />
            )}
            {study && annotations}
        </>
      )}
      {figure && heliodon && (
        <HeliodonPlanOverlay input={heliodon} planScale={planScale} sideM={model.sideM} />
      )}
      {empty && (
        <text x={0} y={0} textAnchor="middle" fontSize={model.sideM * 0.04} fill={planEmpty}>
          {figure ? "No building footprints in this frame" : "Nothing mapped in this frame"}
        </text>
      )}
    </svg>
  );
}
