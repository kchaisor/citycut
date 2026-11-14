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
import {
  importedMassingStrokeStyle,
  importedMassingUpperStrokeStyle,
  planBuildingStrokeStyle,
} from "../lib/planBuildingFill";
import { planPaths, svgPolyline, svgRings } from "../lib/svgPlan";
import { getColour } from "../lib/colours";
import { themeColor } from "../lib/themeColor";
import { useColourRevision } from "../lib/useColourRevision";
import type { CityModel, Pt } from "../types";
import type { SectionKnifeToolState } from "../lib/sectionKnife/state";
import { SectionKnifePlanMarkers } from "./SectionKnifePlanMarkers";
import { HeliodonPlanOverlay } from "./HeliodonPlanOverlay";
import { NswPlanLabels, NswPlanLines, NswPlanUnder } from "./NswPlanLayers";
import { NSW_PLAN_LABEL_SHARE, nswPlanHasDrawableContent, nswPlanItems } from "../lib/nswPlan";
import { readNswPlanStyle } from "../lib/nswPlanStyle";
import {
  importedPlanShadowRings,
  planShadowSplitRings,
  proposedMassingInModel,
  shadowRingsFromMulti,
  type PlanShadowInput,
} from "../lib/buildingShadows";
import { planTreeShadowMulti } from "../lib/solarTreePlanShadow";
import type { HeliodonDiagramInput } from "../lib/heliodonDiagram";
import { createThrottledViewportSink } from "../lib/planViewportThrottle";
import { modelFrameSize } from "../lib/modelFrame";
import { planViewportExtentRect, type PlanViewport } from "../lib/planViewport";
import {
  SINGLE_SHADOW_OPACITY,
  SUN_STUDY_SHADOW_ADDED_OPACITY,
  SUN_STUDY_SHADOW_OPACITY,
  SUN_STUDY_TREE_OPACITY,
  estimatedHeightLabels,
  isClick,
  pickBuilding,
  sunStudyCasterModel,
  type SunStudyCasters,
  type SunStudyDate,
} from "../lib/sunStudyPlan";
import { heliodonLabelFontMetres } from "../lib/heliodonDiagram";
import { useSunStudyShadows } from "./useSunStudyShadows";
import { rasterizePlanShadowRings, rasterizeSunStudyLayers } from "../lib/sunStudyShadowRaster";
import { SunHoursGroundPlanOverlay } from "./SunHoursGroundPlanOverlay";
import { SunHoursRoofPlanOverlay } from "./SunHoursRoofPlanOverlay";
import type { SunHoursGroundRaster } from "../lib/sunHoursGroundRaster";
import { SunHoursLostPlanOverlay } from "./SunHoursLostPlanOverlay";
import type { SunHoursGroundGrid } from "../lib/sunHoursGroundPlan";
import type { SunHoursLostGrid } from "../lib/sunHoursLostPlan";
import { ringFromCorners } from "../lib/solarAccessB43";
import { isParkAssessRow, type SolarAssessRow, type SolarReceptorArea } from "../lib/solarReceptorAssess";
import type { Ring } from "../types";

const NO_SELECTION: readonly number[] = [];

export type DrawingKind = "site" | "figure-ground" | "exploded-axo" | "isometric";

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
  sunStudyCasters = "all",
  sunStudySelected = NO_SELECTION,
  onSunStudyPick,
  solarReceptors = [],
  solarReceptorResults = [],
  receptorDraw = false,
  onReceptorCommit,
  sunHoursLostGrid = null,
  sunHoursGroundGrid = null,
  sunHoursGroundScaleMax = 0,
  sunHoursRoofPlanRaster = null,
  treesCastShadow = false,
  sectionKnife,
}: {
  model: CityModel;
  kind?: DrawingKind;
  onScale?: (widthM: number) => void;
  lineStyle?: LineStyles;
  planScale?: number;
  heliodon?: HeliodonDiagramInput | null;
  castShadows?: boolean;
  shadowInput?: PlanShadowInput | null;
  uniformBuildings?: boolean;
  colourBySource?: boolean;
  highlightManual?: boolean;
  viewport?: PlanViewport;
  onViewportChange?: (view: PlanViewport) => void;
  fitCounter?: number;
  sunStudy?: SunStudyDate | null;
  sunStudyMuted?: boolean;
  sunStudyCasters?: SunStudyCasters;
  sunStudySelected?: readonly number[];
  onSunStudyPick?: (buildingId: number) => void;
  solarReceptors?: readonly SolarReceptorArea[];
  solarReceptorResults?: readonly SolarAssessRow[];
  receptorDraw?: boolean;
  onReceptorCommit?: (ring: Ring) => void;
  sunHoursLostGrid?: SunHoursLostGrid | null;
  sunHoursGroundGrid?: SunHoursGroundGrid | null;
  sunHoursGroundScaleMax?: number;
  sunHoursRoofPlanRaster?: SunHoursGroundRaster | null;
  treesCastShadow?: boolean;
  sectionKnife?: SectionKnifeToolState | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number; view: PlanViewport } | null>(null);
  const receptorDrag = useRef<{ a: Ring[number]; b: Ring[number]; moved: boolean } | null>(null);
  const [receptorPreview, setReceptorPreview] = useState<Ring | null>(null);
  const figure = kind === "figure-ground";
  const colourTick = useColourRevision();
  const style = useMemo(() => lineStyle ?? readDrawingStyle(), [lineStyle, colourTick]);
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
      colourTick,
    ],
  );
  const frameShape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const figurePaths = useMemo(
    () => (figure ? figureGroundModelPaths(model.buildings, model.sideM, frameShape) : []),
    [figure, model, frameShape],
  );
  const frameSize = useMemo(() => modelFrameSize(model), [model.sideM, model.widthM, model.heightM]);
  const fitted = useMemo(
    () => planViewportExtentRect(frameSize.widthM, frameSize.heightM),
    [frameSize.widthM, frameSize.heightM],
  );
  const [internalView, setInternalView] = useState<PlanViewport>(fitted);
  const [liveView, setLiveView] = useState<PlanViewport | null>(null);
  const viewportSinkRef = useRef<ReturnType<typeof createThrottledViewportSink> | null>(null);
  if (onViewportChange && !viewportSinkRef.current) {
    viewportSinkRef.current = createThrottledViewportSink(onViewportChange);
  }
  const view = liveView ?? viewport ?? internalView;
  const resolveView = () => liveView ?? viewport ?? internalView;
  const applyView = (next: PlanViewport | ((current: PlanViewport) => PlanViewport)) => {
    const resolved = typeof next === "function" ? next(resolveView()) : next;
    setLiveView(resolved);
    if (onViewportChange) viewportSinkRef.current?.push(resolved);
    else setInternalView(resolved);
  };

  useEffect(() => {
    if (fitCounter > 0) {
      setLiveView(null);
      viewportSinkRef.current?.flush();
      applyView(fitted);
    }
  }, [fitCounter, fitted]);

  useEffect(() => {
    if (viewport === undefined) setInternalView(fitted);
  }, [model.sideM, model.frameShape, fitted, viewport]);

  useEffect(() => {
    setLiveView(null);
  }, [viewport]);

  useEffect(() => () => viewportSinkRef.current?.flush(), []);

  useEffect(() => {
    onScale?.(view.w);
  }, [onScale, view.w]);

  const applyViewRef = useRef(applyView);
  applyViewRef.current = applyView;
  const sideMRef = useRef(model.sideM);
  sideMRef.current = model.sideM;
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
      const sideM = sideMRef.current;
      applyViewRef.current((current) => {
        const w = current.w * factor;
        const h = current.h * factor;
        if (w < sideM * 0.04 || w > sideM * 6) return current;
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
  }, []);

  const halfW = frameSize.widthM / 2;
  const halfH = frameSize.heightM / 2;
  const half = Math.max(halfW, halfH);
  const framePathD = useMemo(() => {
    if (frameShape === "circle") return svgPolyline(openRing(circleRing(model.sideM / 2)), true);
    return `M ${-halfW} ${-halfH} L ${halfW} ${-halfH} L ${halfW} ${halfH} L ${-halfW} ${halfH} Z`;
  }, [frameShape, frameSize.widthM, frameSize.heightM, model.sideM]);

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
  const northR = model.sideM * 0.0155;
  const northCx = half - northR - model.sideM * 0.004;
  const northCy = -half - model.sideM * 0.033;
  const northTick = northR * 0.32;
  const northApexY = northCy - northR * 1.28;
  const northWingW = northR * 0.52;
  const northWingY = northCy + northR * 0.68;
  const northNotchY = northCy + northR * 0.32;
  const canvas = useMemo(() => themeColor("--drawing-bg"), [colourTick]);
  const figureFill = getColour("--figure-fill");
  const blockFill = getColour("--block-plan");
  const greenFill = getColour("--green-fill");
  const waterFill = getColour("--water-fill");
  const treeFill = getColour("--tree-fill");
  const planEmpty = getColour("--plan-empty");
  const shadowFill = getColour("--shadow-fill");
  const nswStyle = useMemo(() => (model.nsw ? readNswPlanStyle() : null), [model.nsw, colourTick]);
  const nswItems = useMemo(() => {
    if (!nswStyle || frameShape === "a3") return null;
    const items = nswPlanItems(model, nswStyle.hatchM);
    return items && nswPlanHasDrawableContent(items) ? items : null;
  }, [model, nswStyle, frameShape]);
  const study = figure ? null : sunStudy;
  const casterModel = useMemo(
    () => sunStudyCasterModel(model, sunStudyCasters, sunStudySelected),
    [model, sunStudyCasters, sunStudySelected],
  );
  const studyShadows = useSunStudyShadows(casterModel, study, treesCastShadow ? "both" : "off");
  const selectedIds = useMemo(() => new Set(sunStudySelected), [sunStudySelected]);
  const estFont = heliodonLabelFontMetres(planScale, 5);
  const estLabels = useMemo(
    () => (study ? estimatedHeightLabels(casterModel.buildings, sunStudySelected, estFont) : []),
    [study, casterModel, sunStudySelected, estFont],
  );
  const studyShadowFill = getColour("--sun-study-shadow");
  const studyShadowAddedFill = getColour("--sun-study-shadow-added");
  const studyIsolateCasters = sunStudySelected.length > 0;
  const treeCrownShadowFill = getColour("--sun-study-tree-shadow");
  const upperStroke = useMemo(() => importedMassingUpperStrokeStyle(style), [style]);
  const studySunFill = getColour("--sun-study-sun");
  const muted = Boolean(study) && sunStudyMuted;
  const mutedFill = (key: Parameters<typeof getColour>[0], normal: string) => (muted ? getColour(key) : normal);
  const annotationInk = figure ? figureFill : getColour("--sun-compass-label");
  const splitShadow = proposedMassingInModel(casterModel);
  const receptorPassFill = getColour("--solar-receptor-pass");
  const receptorFailFill = getColour("--solar-receptor-fail");
  const receptorWarnFill = getColour("--solar-receptor-warn");
  const receptorOutline = getColour("--solar-receptor-outline");
  const receptorPreviewFill = getColour("--solar-receptor-preview");
  const receptorResultById = useMemo(
    () => new Map(solarReceptorResults.map((row) => [row.id, row])),
    [solarReceptorResults],
  );
  const parkPlanOverlays = useMemo(() => {
    return solarReceptors
      .filter((receptor) => (receptor.kind ?? "yard") === "park")
      .map((receptor) => {
        const row = receptorResultById.get(receptor.id);
        const hatch = row && isParkAssessRow(row) ? row.addedShadowRings : [];
        let sumE = 0;
        let sumN = 0;
        const count = Math.max(1, receptor.ring.length - 1);
        for (let index = 0; index < count; index++) {
          const [east, north] = receptor.ring[index]!;
          sumE += east;
          sumN += north;
        }
        return {
          id: receptor.id,
          ring: receptor.ring,
          hatch,
          labelX: sumE / count,
          labelY: sumN / count,
        };
      });
  }, [solarReceptors, receptorResultById]);

  function planPointFromClient(clientX: number, clientY: number, planView: PlanViewport): Pt {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
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

  function receptorFill(tone: "pass" | "fail" | "warn" | undefined): string {
    if (tone === "fail") return receptorFailFill;
    if (tone === "warn") return receptorWarnFill;
    return receptorPassFill;
  }
  const shadowSplit = useMemo(() => {
    if (!castShadows || !shadowInput || figure || study) return { existing: [], added: [] };
    return planShadowSplitRings(casterModel, shadowInput, true, "off");
  }, [castShadows, figure, casterModel, shadowInput, study]);
  const scrubbedTreeCrownShadows = useMemo(() => {
    if (!treesCastShadow || !castShadows || !shadowInput || figure) return [];
    const trees = model.trees ?? [];
    if (trees.length === 0) return [];
    return shadowRingsFromMulti(planTreeShadowMulti(model, shadowInput, trees));
  }, [treesCastShadow, castShadows, shadowInput, figure, model]);
  const studyShadowRasters = useMemo(() => {
    if (!study || studyIsolateCasters || studyShadows.layers.length === 0) return [];
    const layers = splitShadow
      ? studyShadows.layers.map((layer) => ({ ...layer, addedRings: [] as typeof layer.addedRings }))
      : studyShadows.layers;
    return rasterizeSunStudyLayers(layers, model.sideM);
  }, [study, studyIsolateCasters, splitShadow, studyShadows.layers, model.sideM]);
  const studyScrubAddedRings = useMemo(() => {
    if (!study || studyIsolateCasters || !splitShadow || !shadowInput) return [];
    const layer = studyShadows.layers.find((entry) => entry.hour === shadowInput.hour);
    return layer?.addedRings ?? [];
  }, [study, studyIsolateCasters, splitShadow, shadowInput, studyShadows.layers]);
  const treeCrownShadowRaster = useMemo(
    () =>
      scrubbedTreeCrownShadows.length > 0
        ? rasterizePlanShadowRings(scrubbedTreeCrownShadows, model.sideM, treeCrownShadowFill, 0.68)
        : null,
    [scrubbedTreeCrownShadows, model.sideM, treeCrownShadowFill],
  );
  const addedHatchSize = Math.max(3.5, model.sideM * 0.008);
  const importedShadowReady = useMemo(() => {
    if (!shadowInput) return false;
    return importedPlanShadowRings(casterModel, shadowInput, true).length > 0;
  }, [casterModel, shadowInput]);
  const annotations = (
    <>
      <g aria-hidden="true" className="plan-north-arrow">
        <circle
          cx={northCx}
          cy={northCy}
          r={northR}
          fill="none"
          stroke={annotationInk}
          strokeWidth={1.2}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={northCx - northR - northTick}
          y1={northCy}
          x2={northCx - northR * 0.55}
          y2={northCy}
          stroke={annotationInk}
          strokeWidth={notePx}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={northCx + northR * 0.55}
          y1={northCy}
          x2={northCx + northR + northTick}
          y2={northCy}
          stroke={annotationInk}
          strokeWidth={notePx}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={northCx}
          y1={northCy + northR * 0.45}
          x2={northCx}
          y2={northCy + northR + northTick}
          stroke={annotationInk}
          strokeWidth={notePx}
          vectorEffect="non-scaling-stroke"
        />
        <polygon
          points={`${northCx},${northApexY} ${northCx - northWingW},${northWingY} ${northCx},${northNotchY}`}
          fill={annotationInk}
          stroke={annotationInk}
          strokeWidth={1}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <polygon
          points={`${northCx},${northApexY} ${northCx + northWingW},${northWingY} ${northCx},${northNotchY}`}
          fill={canvas}
          stroke={annotationInk}
          strokeWidth={1}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={northCx}
          y={northApexY - northR * 0.38}
          textAnchor="middle"
          fontSize={model.sideM * 0.016}
          fontWeight={700}
          letterSpacing="0.08em"
          fill={annotationInk}
          fontFamily="Inter, Helvetica, Arial, sans-serif"
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
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
      onDoubleClick={() => applyView(fitted)}
      onMouseDown={(event) => {
        event.preventDefault();
        window.getSelection?.()?.removeAllRanges?.();
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        window.getSelection?.()?.removeAllRanges?.();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        if (receptorDraw && onReceptorCommit) {
          const at = planPointFromClient(event.clientX, event.clientY, view);
          receptorDrag.current = { a: at, b: at, moved: false };
          setReceptorPreview(ringFromCorners(at, at));
          return;
        }
        drag.current = { px: event.clientX, py: event.clientY, view };
      }}
      onPointerMove={(event) => {
        const draw = receptorDrag.current;
        if (draw && onReceptorCommit) {
          event.preventDefault();
          const at = planPointFromClient(event.clientX, event.clientY, view);
          draw.b = at;
          draw.moved = true;
          setReceptorPreview(ringFromCorners(draw.a, draw.b));
          return;
        }
        const start = drag.current;
        const svg = svgRef.current;
        if (!start || !svg) return;
        event.preventDefault();
        window.getSelection?.()?.removeAllRanges?.();
        const rect = svg.getBoundingClientRect();
        const dx = ((event.clientX - start.px) / rect.width) * start.view.w;
        const dy = ((event.clientY - start.py) / rect.height) * start.view.h;
        const next = { ...start.view, x: start.view.x - dx, y: start.view.y - dy };
        if (onViewportChange) onViewportChange(next);
        else setInternalView(next);
      }}
      onPointerUp={(event) => {
        const draw = receptorDrag.current;
        if (draw && onReceptorCommit) {
          receptorDrag.current = null;
          const ring = ringFromCorners(draw.a, draw.b);
          setReceptorPreview(null);
          const minE = Math.min(draw.a[0], draw.b[0]);
          const maxE = Math.max(draw.a[0], draw.b[0]);
          const minN = Math.min(draw.a[1], draw.b[1]);
          const maxN = Math.max(draw.a[1], draw.b[1]);
          if (maxE - minE >= 2 && maxN - minN >= 2) onReceptorCommit(ring);
          return;
        }
        const start = drag.current;
        drag.current = null;
        const svg = svgRef.current;
        if (!start || !svg || !study || !onSunStudyPick) return;
        if (!isClick(event.clientX - start.px, event.clientY - start.py)) return;
        const local = planPointFromClient(event.clientX, event.clientY, start.view);
        if (onViewportChange) onViewportChange(start.view);
        else setInternalView(start.view);
        const hit = pickBuilding(model.buildings, local);
        if (hit) onSunStudyPick(hit.id);
      }}
    >
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={canvas} />
      {(splitShadow || parkPlanOverlays.some((overlay) => overlay.hatch.length > 0)) && (
        <defs>
          <pattern
            id="sun-study-added-hatch"
            patternUnits="userSpaceOnUse"
            width={addedHatchSize}
            height={addedHatchSize}
            patternTransform="rotate(45)"
          >
            <rect
              width={addedHatchSize}
              height={addedHatchSize}
              fill={studyShadowAddedFill}
              fillOpacity={SUN_STUDY_SHADOW_ADDED_OPACITY * 0.62}
            />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={addedHatchSize}
              stroke={studyShadowAddedFill}
              strokeWidth={addedHatchSize * 0.38}
            />
            <line
              x1={addedHatchSize * 0.45}
              y1={0}
              x2={addedHatchSize * 0.45}
              y2={addedHatchSize}
              stroke={studyShadowAddedFill}
              strokeWidth={addedHatchSize * 0.22}
            />
          </pattern>
          {parkPlanOverlays.map((overlay) =>
            overlay.hatch.length > 0 ? (
              <clipPath key={`park-clip-${overlay.id}`} id={`solar-park-clip-${overlay.id}`}>
                <path d={svgRings([overlay.ring])} fillRule="evenodd" />
              </clipPath>
            ) : null,
          )}
        </defs>
      )}
      <rect
        data-cut-frame="1"
        x={-halfW}
        y={-halfH}
        width={frameSize.widthM}
        height={frameSize.heightM}
        fill={canvas}
      />
      {figure ? (
        <>
          {figurePaths.map((d, index) => (
            <path key={`f${index}`} d={d} fill={figureFill} fillRule="evenodd" />
          ))}
          {plan.importedUpperLevels.map((level, levelIndex) => (
            <g key={`fig-imu${levelIndex}`} aria-hidden="true">
              {level.lines.map((line, lineIndex) => (
                <path
                  key={`fig-imul${lineIndex}`}
                  d={svgPolyline(openRing(line), true)}
                  fill="none"
                  stroke={getColour("--imported-massing-upper-stroke")}
                  strokeWidth={screenPx(upperStroke.mm)}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
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
                fill={
                  muted
                    ? mutedFill("--sun-study-road", style.roadFill)
                    : uniformBuildings
                      ? getColour("--uniform-road")
                      : style.roadFill
                }
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
            {importedShadowReady ? <g aria-hidden="true" data-imported-shadow="true" /> : null}
            {nswItems && nswStyle && <NswPlanLines items={nswItems} style={nswStyle} />}
            {studyIsolateCasters &&
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
                  {layer.addedRings.map((rings, index) => (
                    <path
                      key={`a${index}`}
                      data-shadow-added
                      d={svgRings(rings)}
                      fill="url(#sun-study-added-hatch)"
                      fillRule="evenodd"
                      stroke="none"
                    />
                  ))}
                </g>
              ))}
            {!studyIsolateCasters &&
              studyShadowRasters.map((layer) => (
                <g key={`ssr${layer.hour}`} data-shadow-hour={layer.hour}>
                  <image
                    href={layer.href}
                    x={layer.east}
                    y={-(layer.north + layer.heightM)}
                    width={layer.widthM}
                    height={layer.heightM}
                    preserveAspectRatio="none"
                  />
                </g>
              ))}
            {studyScrubAddedRings.map((rings, index) => (
              <path
                key={`sscrub-a${index}`}
                data-shadow-added
                d={svgRings(rings)}
                fill="url(#sun-study-added-hatch)"
                fillRule="evenodd"
                stroke="none"
              />
            ))}
            {shadowSplit.existing.map((rings, index) => (
              <path
                key={`sh${index}`}
                data-plan-shadow="single"
                d={svgRings(rings)}
                fill={shadowFill}
                fillOpacity={SINGLE_SHADOW_OPACITY}
                fillRule="evenodd"
                stroke="none"
              />
            ))}
            {shadowSplit.added.map((rings, index) => (
              <path
                key={`sha${index}`}
                data-shadow-added
                d={svgRings(rings)}
                fill={splitShadow ? "url(#sun-study-added-hatch)" : studyShadowAddedFill}
                fillOpacity={splitShadow ? 1 : SINGLE_SHADOW_OPACITY}
                fillRule="evenodd"
                stroke="none"
              />
            ))}
            {treeCrownShadowRaster && (
              <image
                data-tree-crown-shadow
                href={treeCrownShadowRaster.href}
                x={treeCrownShadowRaster.east}
                y={-(treeCrownShadowRaster.north + treeCrownShadowRaster.heightM)}
                width={treeCrownShadowRaster.widthM}
                height={treeCrownShadowRaster.heightM}
                preserveAspectRatio="none"
              />
            )}
            {sunHoursGroundGrid && (
              <SunHoursGroundPlanOverlay grid={sunHoursGroundGrid} scaleMaxHours={sunHoursGroundScaleMax || sunHoursGroundGrid.maxSunHours} />
            )}
            {plan.buildings.map((building, index) => (
              <path
                key={`b${index}`}
                {...(building.imported ? { "data-imported-podium": true } : {})}
                d={svgRings(building.rings)}
                fill={
                  sunHoursRoofPlanRaster
                    ? "none"
                    : muted && !building.site
                      ? getColour("--sun-study-building")
                      : building.fill
                }
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
            {sunHoursRoofPlanRaster ? <SunHoursRoofPlanOverlay raster={sunHoursRoofPlanRaster} /> : null}
            {plan.importedUpperLevels.map((level, levelIndex) => (
              <g key={`imu${levelIndex}`} data-upper-z={level.z} aria-hidden="true">
                {level.lines.map((line, lineIndex) => (
                  <path
                    key={`imul${lineIndex}`}
                    data-imported-upper-outline="true"
                    d={svgPolyline(openRing(line), true)}
                    fill="none"
                    {...screenPenAttrs(upperStroke, "miter")}
                  />
                ))}
              </g>
            ))}
            {study &&
              model.buildings
                .filter((building) => selectedIds.has(building.id))
                .map((building) => (
                  <path
                    key={`sel${building.id}`}
                    data-selected-building={building.id}
                    d={svgRings([building.ring, ...building.holes])}
                    fill={studySunFill}
                    fillOpacity={0.85}
                    fillRule="evenodd"
                    stroke={annotationInk}
                    strokeWidth={screenPx(0.35)}
                    vectorEffect="non-scaling-stroke"
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
            {sunHoursLostGrid && <SunHoursLostPlanOverlay grid={sunHoursLostGrid} />}
            {parkPlanOverlays.map((overlay) =>
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
                      fill="url(#sun-study-added-hatch)"
                      fillRule="evenodd"
                      stroke={studyShadowAddedFill}
                      strokeWidth={Math.max(0.35, addedHatchSize * 0.16)}
                      strokeLinejoin="round"
                    />
                  ))}
                </g>
              ) : null,
            )}
            {solarReceptors.map((receptor) => {
              const row = receptorResultById.get(receptor.id);
              const isPark = (receptor.kind ?? "yard") === "park";
              let sumE = 0;
              let sumN = 0;
              const labelCount = Math.max(1, receptor.ring.length - 1);
              for (let index = 0; index < labelCount; index++) {
                const [east, north] = receptor.ring[index]!;
                sumE += east;
                sumN += north;
              }
              return (
                <g key={`sr${receptor.id}`} data-solar-receptor-group={receptor.id}>
                  <path
                    data-solar-receptor-overlay={receptor.id}
                    data-solar-park-receptor={isPark ? receptor.id : undefined}
                    data-solar-receptor-status={row?.statusTone ?? "pass"}
                    d={svgRings([receptor.ring])}
                    fill={receptorFill(row?.statusTone)}
                    fillOpacity={isPark ? 0.35 : 0.52}
                    fillRule="evenodd"
                    stroke={receptorOutline}
                    strokeWidth={screenPx(isPark ? 0.6 : 0.35)}
                    strokeDasharray={isPark ? "7 4" : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                  {isPark && (
                    <text
                      data-solar-park-label={receptor.id}
                      x={sumE / labelCount}
                      y={-(sumN / labelCount)}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={Math.max(model.sideM * 0.018, 3.2)}
                      fontWeight={700}
                      letterSpacing="0.06em"
                      fill={receptorOutline}
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
            {receptorPreview && (
              <path
                data-solar-receptor-preview
                d={svgRings([receptorPreview])}
                fill={receptorPreviewFill}
                fillOpacity={0.35}
                fillRule="evenodd"
                stroke={receptorOutline}
                strokeWidth={screenPx(0.35)}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {nswItems && nswStyle && <NswPlanLabels items={nswItems} style={nswStyle} sizeM={model.sideM * NSW_PLAN_LABEL_SHARE} />}
            {sectionKnife?.active ? (
              <SectionKnifePlanMarkers
                model={model}
                tool={sectionKnife}
                svgRef={svgRef}
                viewWidthM={view.w}
              />
            ) : null}
            <path d={framePathD} fill="none" {...screenPenAttrs(style.frame, "miter")} />
            {heliodon && (
              <HeliodonPlanOverlay input={heliodon} planScale={planScale} sideM={model.sideM} sunStudy={study} />
            )}
            {study && annotations}
            {estLabels.length > 0 && (
              <g className="sun-study-est" aria-hidden="true" fontFamily="Helvetica, Arial, sans-serif">
                {estLabels.map((label) => (
                  <text
                    key={label.id}
                    x={label.at[0]}
                    y={-label.at[1]}
                    fontSize={estFont}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={annotationInk}
                  >
                    {label.text}
                  </text>
                ))}
              </g>
            )}
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
