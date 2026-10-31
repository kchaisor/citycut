import { useEffect, useMemo, useRef, useState } from "react";
import { dashScreen, readDrawingStyle } from "../lib/drawingStyle";
import {
  buildIsometricDrawing,
  DEFAULT_ISO_CORNER,
  isometricDrawingBounds,
  readIsometricDrawingColors,
  type IsoCorner,
} from "../lib/isometricDrawing";
import { explodedAxoViewportExtent, type PlanViewport } from "../lib/planViewport";
import { themeColor } from "../lib/themeColor";
import { useColourRevision } from "../lib/useColourRevision";
import { DEFAULT_VIEW3D_DISPLAY, type View3dDisplaySettings } from "../lib/view3dDisplay";
import type { CityModel } from "../types";

function clearDocumentSelection(): void {
  if (typeof window === "undefined") return;
  try {
    window.getSelection?.()?.removeAllRanges?.();
  } catch {
  }
}

export function DrawingIsometric({
  model,
  corner = DEFAULT_ISO_CORNER,
  display = DEFAULT_VIEW3D_DISPLAY,
  planScale = 1000,
  onScale,
  viewport,
  onViewportChange,
  fitCounter = 0,
}: {
  model: CityModel;
  corner?: IsoCorner;
  display?: View3dDisplaySettings;
  planScale?: number;
  onScale?: (widthM: number) => void;
  viewport?: PlanViewport;
  onViewportChange?: (view: PlanViewport) => void;
  fitCounter?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number; view: PlanViewport } | null>(null);
  const colourTick = useColourRevision();

  const fitted = useMemo(() => {
    const bounds = isometricDrawingBounds(model, corner);
    return explodedAxoViewportExtent(bounds);
  }, [model, corner]);

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
  }, [model.sideM, model.frameShape, corner]);

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

  const colors = useMemo(() => readIsometricDrawingColors(), [colourTick]);
  const lineStyle = useMemo(() => readDrawingStyle(), [colourTick]);
  const iso = useMemo(
    () =>
      buildIsometricDrawing(model, {
        corner,
        display,
        colors,
        planScale,
      }),
    [model, corner, display, colors, planScale],
  );

  const contourDash = dashScreen(lineStyle.contour.dash);
  const tramDash = dashScreen(lineStyle.tram.dash);
  const clipId = `iso-frame-clip-${corner}`;

  return (
    <svg
      ref={svgRef}
      className="plan isometric-drawing"
      data-iso-corner={corner}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      role="img"
      aria-label={`Isometric 3D drawing (${corner.toUpperCase()})`}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
      onDoubleClick={() => applyView(fitted)}
      onMouseDown={(event) => {
        event.preventDefault();
        clearDocumentSelection();
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        clearDocumentSelection();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        drag.current = { px: event.clientX, py: event.clientY, view };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        const svg = svgRef.current;
        if (!start || !svg) return;
        event.preventDefault();
        clearDocumentSelection();
        const rect = svg.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const dx = ((event.clientX - start.px) / rect.width) * start.view.w;
        const dy = ((event.clientY - start.py) / rect.height) * start.view.h;
        const next = { ...start.view, x: start.view.x - dx, y: start.view.y - dy };
        if (onViewportChange) onViewportChange(next);
        else setInternalView(next);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={iso.frameD} />
        </clipPath>
      </defs>

      <rect x={view.x} y={view.y} width={view.w} height={view.h} fill={themeColor("--drawing-bg")} />

      <g className="iso-ground" data-iso-layer="ground">
        <path
          d={iso.frameD}
          fill={iso.colors.ground}
          stroke={iso.colors.frameEdge}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </g>

      <g clipPath={`url(#${clipId})`}>
        {iso.landscapePaths.length > 0 && (
          <g className="iso-landscape" data-iso-layer="landscape">
            {iso.landscapePaths.map((d, i) => (
              <path
                key={`land-${i}`}
                d={d}
                fill={iso.colors.landscape}
                fillRule="evenodd"
                stroke={iso.colors.frameEdge}
                strokeWidth={0.4}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ))}
          </g>
        )}

        {iso.waterPaths.length > 0 && (
          <g className="iso-water" data-iso-layer="water">
            {iso.waterPaths.map((d, i) => (
              <path
                key={`water-${i}`}
                d={d}
                fill={iso.colors.water}
                fillRule="evenodd"
                stroke={iso.colors.frameEdge}
                strokeWidth={0.45}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ))}
          </g>
        )}

        {iso.footpathPaths.length > 0 && (
          <g className="iso-footpaths" data-iso-layer="footpaths">
            {iso.footpathPaths.map((d, i) =>
              d.endsWith("Z") ? (
                <path
                  key={`fp-${i}`}
                  d={d}
                  fill={iso.colors.footpaths}
                  fillRule="evenodd"
                  stroke={iso.colors.footpathEdge}
                  strokeWidth={0.35}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  key={`fp-${i}`}
                  d={d}
                  fill="none"
                  stroke={iso.colors.footpaths}
                  strokeWidth={1.1}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ),
            )}
          </g>
        )}

        {iso.contourLines.length > 0 && (
          <g className="iso-contours" data-iso-layer="contours">
            {iso.contourLines.map((line, i) => (
              <path
                key={`ct-${i}`}
                d={line.d}
                fill="none"
                stroke={iso.colors.contours}
                strokeWidth={line.index ? 1.15 : 0.75}
                strokeDasharray={contourDash.array}
                strokeLinecap={contourDash.cap}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )}

        {(iso.roadPaths.length > 0 || iso.roadCenterlines.length > 0) && (
          <g className="iso-roads" data-iso-layer="roads">
            {iso.roadPaths.length > 0
              ? iso.roadPaths.map((d, i) => (
                  <path
                    key={`rd-${i}`}
                    d={d}
                    fill={iso.colors.roads}
                    fillRule="evenodd"
                    stroke={iso.colors.roadEdge}
                    strokeWidth={0.45}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                  />
                ))
              : iso.roadCenterlines.map((d, i) => (
                  <path
                    key={`rdc-${i}`}
                    d={d}
                    fill="none"
                    stroke={iso.colors.roads}
                    strokeWidth={1.8}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
          </g>
        )}

        {(iso.railLines.length > 0 || iso.tramLines.length > 0) && (
          <g className="iso-rail" data-iso-layer="rail">
            {iso.railLines.map((d, i) => (
              <path
                key={`rl-${i}`}
                d={d}
                fill="none"
                stroke={iso.colors.rail}
                strokeWidth={1.4}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {iso.tramLines.map((d, i) => (
              <path
                key={`tr-${i}`}
                d={d}
                fill="none"
                stroke={iso.colors.tram}
                strokeWidth={1.2}
                strokeDasharray={tramDash.array ?? "4 3"}
                strokeLinecap={tramDash.cap}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )}
      </g>

      {iso.frameWalls.length > 0 && (
        <g className="iso-ground-plinth" data-iso-layer="ground-plinth">
          {iso.frameWalls.map((wall, i) => (
            <path
              key={`plinth-${wall.side}-${i}`}
              className={`iso-plinth-wall iso-plinth-wall-${wall.side}`}
              data-plinth-side={wall.side}
              d={wall.d}
              fill={wall.fill}
              stroke={wall.stroke}
              strokeWidth={1.35}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          ))}
        </g>
      )}

      <path
        d={iso.frameD}
        fill="none"
        stroke={iso.colors.frameEdge}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />

      {iso.solids.length > 0 && (
        <g className="iso-solids" data-iso-layer="solids">
          {iso.solids.map((item, idx) =>
            item.kind === "building" ? (
              <g
                key={`b-${item.id}-${idx}`}
                className="iso-building"
                data-building-id={item.id}
                strokeLinejoin="round"
              >
                {item.walls.map((wall, wi) => (
                  <path
                    key={`w-${wi}`}
                    d={wall.d}
                    fill={wall.fill}
                    stroke={wall.stroke}
                    strokeWidth={0.75}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <path
                  d={item.roofD}
                  fill={item.roofFill}
                  fillRule="evenodd"
                  stroke={item.stroke}
                  strokeWidth={0.95}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ) : (
              <g key={`t-${item.id}-${idx}`} className="iso-tree" data-tree-id={item.id}>
                {item.trunkD && (
                  <path
                    d={item.trunkD}
                    fill="none"
                    stroke={item.trunkFill}
                    strokeWidth={0.85}
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                  />
                )}
                <path
                  d={item.canopyD}
                  fill={item.canopyFill}
                  stroke={item.stroke}
                  strokeWidth={0.75}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
              </g>
            ),
          )}
        </g>
      )}
    </svg>
  );
}
