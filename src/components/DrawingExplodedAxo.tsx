import { useEffect, useMemo, useRef, useState } from "react";
import {
  AXO_HATCH_PAINTS,
  AXO_LAYER_LABELS,
  axoLayerBasePaint,
  axoLayerLabelAnchor,
  axoLayerColours,
  axoLayerSvgTransform,
  axoLayersForPaint,
  axoPaintColour,
  buildExplodedAxoLayers,
  explodedAxoBounds,
  isoSatelliteImageTransform,
  planToIsoBase,
  type ExplodedAxoSettings,
  type AxoPaintKey,
} from "../lib/explodedAxo";
import { useExplodedAxoOverlays } from "../lib/explodedAxoOverlays";
import { fetchSatelliteFramePng, satelliteFrameDataUrl } from "../lib/explodedAxoSatellite";
import { explodedAxoViewportExtent, type PlanViewport } from "../lib/planViewport";
import { getColour } from "../lib/colours";
import { dashScreen, readDrawingStyle } from "../lib/drawingStyle";
import { themeColor } from "../lib/themeColor";
import { useColourRevision } from "../lib/useColourRevision";
import type { CityModel } from "../types";

function hatchPatternId(paint: AxoPaintKey): string {
  return `axo-hatch-${paint}`;
}

function resolveFillPaint(
  layerId: Parameters<typeof axoLayerBasePaint>[0],
  index: number,
  layer: ReturnType<typeof buildExplodedAxoLayers>["layers"][number],
): AxoPaintKey {
  return layer.fillPaints?.[index] ?? axoLayerBasePaint(layerId);
}

function resolveStrokePaint(
  layerId: Parameters<typeof axoLayerBasePaint>[0],
  index: number,
  layer: ReturnType<typeof buildExplodedAxoLayers>["layers"][number],
): AxoPaintKey {
  return layer.strokePaints?.[index] ?? axoLayerBasePaint(layerId);
}

export function DrawingExplodedAxo({
  model,
  settings,
  onScale,
  viewport,
  onViewportChange,
  fitCounter = 0,
}: {
  model: CityModel;
  settings: ExplodedAxoSettings;
  onScale?: (widthM: number) => void;
  viewport?: PlanViewport;
  onViewportChange?: (view: PlanViewport) => void;
  fitCounter?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number; view: PlanViewport } | null>(null);
  const overlays = useExplodedAxoOverlays(model, settings.layerVisible);
  const fitted = useMemo(() => {
    const bounds = explodedAxoBounds(model, settings);
    return explodedAxoViewportExtent(bounds);
  }, [model, settings]);
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
    applyView(fitted);
  }, [model.sideM, model.frameShape]);

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
        if (w < model.sideM * 0.04 || w > model.sideM * 12) return current;
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

  const { layers, guides } = useMemo(
    () => buildExplodedAxoLayers(model, settings, overlays),
    [model, settings, overlays],
  );
  const paintLayers = useMemo(() => axoLayersForPaint(layers), [layers]);
  const colourTick = useColourRevision();
  const colours = useMemo(() => axoLayerColours(), [colourTick]);
  const [satelliteHref, setSatelliteHref] = useState<string | null>(null);
  const showAerial = settings.layerVisible.aerial;

  useEffect(() => {
    if (!showAerial) return;
    let cancelled = false;
    void fetchSatelliteFramePng(model).then((png) => {
      if (cancelled || !png) {
        if (!cancelled) setSatelliteHref(null);
        return;
      }
      setSatelliteHref(satelliteFrameDataUrl(png));
    });
    return () => {
      cancelled = true;
    };
  }, [model, showAerial]);

  const clipIds = paintLayers.map((layer) => `axo-clip-${layer.id}-${layer.liftM}`);
  const outlinePx = model.sideM * 0.0018;
  const roadPx = model.sideM * 0.0045;
  const hatchStep = model.sideM * 0.012;
  const lineStyle = useMemo(() => readDrawingStyle(), [colourTick]);
  const guideDash = dashScreen(lineStyle.axoGuideDash ?? "none");
  const tramColour = getColour("--tram-line-stroke");

  return (
    <svg
      ref={svgRef}
      className="plan exploded-axo"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      role="img"
      aria-label="Exploded axonometric drawing"
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
      <defs>
        {AXO_HATCH_PAINTS.map((paint) => {
          const colour = axoPaintColour(paint);
          const id = hatchPatternId(paint);
          const cross =
            paint === "plan-flood"
              ? `<path d="M0 ${hatchStep} L${hatchStep} 0" stroke="${colour}" stroke-width="${model.sideM * 0.001}" />`
              : paint === "plan-heritage"
                ? `<path d="M0 0 L0 ${hatchStep} M0 0 L${hatchStep} 0" stroke="${colour}" stroke-width="${model.sideM * 0.0012}" />`
                : paint === "plan-ddo"
                  ? `<path d="M0 ${hatchStep / 2} L${hatchStep / 2} 0 L${hatchStep} ${hatchStep / 2} L${hatchStep / 2} ${hatchStep} Z" fill="none" stroke="${colour}" stroke-width="${model.sideM * 0.0008}" />`
                  : `<path d="M0 0 L${hatchStep} ${hatchStep} M${hatchStep} 0 L0 ${hatchStep}" stroke="${colour}" stroke-width="${model.sideM * 0.001}" />`;
          return (
            <pattern
              key={id}
              id={id}
              patternUnits="userSpaceOnUse"
              width={hatchStep}
              height={hatchStep}
            >
              <rect width={hatchStep} height={hatchStep} fill={axoPaintColour(paint)} fillOpacity={0.22} />
              {cross}
            </pattern>
          );
        })}
        {paintLayers.map((layer, index) => (
          <clipPath key={clipIds[index]} id={clipIds[index]}>
            <path d={layer.clipD} />
          </clipPath>
        ))}
      </defs>
      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={themeColor("--drawing-bg")} />

      {guides.map((guide, index) => (
        <line
          key={`g${index}`}
          x1={guide.x}
          y1={guide.yTop}
          x2={guide.x}
          y2={guide.yBottom}
          stroke={getColour("--axo-guide-dash")}
          strokeWidth={model.sideM * 0.0012}
          strokeDasharray={guideDash.array}
          strokeLinecap={guideDash.cap}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {paintLayers.map((layer, index) => {
        const clip = `url(#${clipIds[index]})`;
        const layerTransform = axoLayerSvgTransform(layer.liftM);
        const legendOrigin = planToIsoLegendOrigin(model.sideM);
        return (
          <g key={`${layer.id}-${layer.liftM}`} transform={layerTransform}>
            <g clipPath={clip}>
              {layer.id === "aerial" && satelliteHref && (
                <image
                  href={satelliteHref}
                  x={0}
                  y={0}
                  width={model.sideM}
                  height={model.sideM}
                  preserveAspectRatio="xMidYMid slice"
                  transform={isoSatelliteImageTransform(model.sideM)}
                />
              )}
              {layer.fills.map((d, fi) => {
                const paint = resolveFillPaint(layer.id, fi, layer);
                const fill = AXO_HATCH_PAINTS.includes(paint) ? `url(#${hatchPatternId(paint)})` : axoPaintColour(paint);
                return <path key={`f${fi}`} d={d} fill={fill} fillRule="evenodd" stroke="none" />;
              })}
              {layer.strokes.map((d, si) => {
                const paint = resolveStrokePaint(layer.id, si, layer);
                const scale = layer.strokeWidthScales?.[si] ?? 1;
                const dashed = layer.strokeDashed?.[si];
                const tramDash = dashed ? dashScreen(lineStyle.tram.dash) : null;
                return (
                  <path
                    key={`s${si}`}
                    d={d}
                    fill="none"
                    stroke={dashed ? tramColour : axoPaintColour(paint)}
                    strokeWidth={roadPx * scale}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap={tramDash?.cap ?? "round"}
                    strokeLinejoin="round"
                    strokeDasharray={tramDash?.array}
                  />
                );
              })}
              {layer.markers?.map((marker, mi) => (
                <circle
                  key={`m${mi}`}
                  cx={marker.x}
                  cy={marker.y}
                  r={marker.radiusM}
                  fill={axoPaintColour(marker.paint)}
                  fillOpacity={marker.paint === "trees" ? lineStyle.treeFillOpacity : 1}
                  stroke="none"
                />
              ))}
            </g>
            <path
              d={layer.plateOutlineD}
              fill="none"
              stroke={colours.guide}
              strokeWidth={outlinePx}
              vectorEffect="non-scaling-stroke"
            />
            {layer.legend && layer.legend.length > 0 && (
              <g className="axo-legend" transform={`translate(${legendOrigin.x} ${legendOrigin.y})`}>
                {layer.legend.map((item, li) => {
                  const swatchY = li * model.sideM * 0.042;
                  const swatchSize = model.sideM * 0.032;
                  const fill = AXO_HATCH_PAINTS.includes(item.paint)
                    ? `url(#${hatchPatternId(item.paint)})`
                    : axoPaintColour(item.paint);
                  return (
                    <g key={item.label} transform={`translate(0 ${swatchY})`}>
                      <rect width={swatchSize} height={swatchSize} fill={fill} stroke={colours.guide} strokeWidth={model.sideM * 0.0004} />
                      <text
                        x={swatchSize * 1.4}
                        y={swatchSize * 0.85}
                        fontSize={model.sideM * 0.036}
                        fill={colours.label}
                        fontFamily="Helvetica, Arial, sans-serif"
                      >
                        {item.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
            {layer.unavailableNote && (
              <text
                x={legendOrigin.x}
                y={legendOrigin.y - model.sideM * 0.02}
                fontSize={model.sideM * 0.02}
                fill={colours.label}
                fontFamily="Helvetica, Arial, sans-serif"
              >
                {layer.unavailableNote}
              </text>
            )}
          </g>
        );
      })}
      {settings.showLabels &&
        paintLayers.map((layer) => {
          const label = axoLayerLabelAnchor(model.sideM, layer.liftM);
          return (
            <text
              key={`label-${layer.id}-${layer.liftM}`}
              x={label.x}
              y={label.y}
              fontSize={model.sideM * 0.032}
              fill={colours.label}
              fontFamily="Helvetica, Arial, sans-serif"
              transform={`rotate(${label.rotateDeg + 180} ${label.x} ${label.y})`}
            >
              {AXO_LAYER_LABELS[layer.id]}
            </text>
          );
        })}
    </svg>
  );
}

/** Lower-left on the plate in iso base coords for legends and notes. */
function planToIsoLegendOrigin(sideM: number): { x: number; y: number } {
  const half = sideM / 2;
  const [x, y] = planToIsoBase(-half + sideM * 0.06, half - sideM * 0.08);
  return { x, y };
}
