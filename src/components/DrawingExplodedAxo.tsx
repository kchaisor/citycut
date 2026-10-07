import { useEffect, useMemo, useRef, useState } from "react";
import {
  AXO_LAYER_LABELS,
  axoLayerLabelAnchor,
  axoLayerColours,
  axoLayersForPaint,
  buildExplodedAxoLayers,
  explodedAxoBounds,
  isoSatelliteImageTransform,
  type ExplodedAxoSettings,
} from "../lib/explodedAxo";
import { fetchSatelliteFramePng, satelliteFrameDataUrl } from "../lib/explodedAxoSatellite";
import { explodedAxoViewportExtent, type PlanViewport } from "../lib/planViewport";
import { themeColor } from "../lib/themeColor";
import { useColourRevision } from "../lib/useColourRevision";
import type { CityModel } from "../types";

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

  const { layers, guides } = useMemo(() => buildExplodedAxoLayers(model, settings), [model, settings]);
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
          stroke={colours.guide}
          strokeWidth={model.sideM * 0.0012}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {paintLayers.map((layer, index) => {
        const fillColour =
          layer.id === "water"
            ? colours.water
            : layer.id === "roads"
              ? colours.roads
              : layer.id === "green"
                ? colours.green
                : colours.buildings;
        const clip = `url(#${clipIds[index]})`;
        const label = axoLayerLabelAnchor(model.sideM, layer.liftM);
        return (
          <g key={`${layer.id}-${layer.liftM}`} clipPath={clip}>
            {layer.id === "aerial" && satelliteHref && (
              <image
                href={satelliteHref}
                x={0}
                y={0}
                width={model.sideM}
                height={model.sideM}
                preserveAspectRatio="xMidYMid slice"
                transform={isoSatelliteImageTransform(model.sideM, layer.liftM)}
              />
            )}
            {layer.fills.map((d, fi) => (
              <path key={`f${fi}`} d={d} fill={fillColour} fillRule="evenodd" stroke="none" />
            ))}
            {layer.strokes.map((d, si) => (
              <path
                key={`s${si}`}
                d={d}
                fill="none"
                stroke={fillColour}
                strokeWidth={roadPx}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            <path
              d={layer.plateOutlineD}
              fill="none"
              stroke={colours.guide}
              strokeWidth={outlinePx}
              vectorEffect="non-scaling-stroke"
            />
            {settings.showLabels && (
              <text
                x={label.x}
                y={label.y}
                fontSize={model.sideM * 0.032}
                fill={colours.label}
                fontFamily="Helvetica, Arial, sans-serif"
                transform={`rotate(${label.rotateDeg} ${label.x} ${label.y})`}
              >
                {AXO_LAYER_LABELS[layer.id]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
