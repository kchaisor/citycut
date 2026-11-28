import type { CityModel, Pt } from "../types";
import { getColour } from "./colours";
import { ARROW_COLOUR_TOKENS, type DiagramArrow } from "./diagramArrows";
import { lightenArrowColour, liveArrowShape } from "./diagramArrowsMotion";
import { shapeFills, type ArrowShape } from "./diagramArrowsShape";

export type PlanArrowTransform = { ox: number; oy: number; exX: number; exY: number; enX: number; enY: number };

function tracePolygon(ctx: CanvasRenderingContext2D, polygon: readonly Pt[]): void {
  polygon.forEach(([east, north], index) => (index === 0 ? ctx.moveTo(east, north) : ctx.lineTo(east, north)));
  ctx.closePath();
}

function fillShape(ctx: CanvasRenderingContext2D, shape: ArrowShape, fill: string): void {
  const fills = shapeFills(shape);
  ctx.fillStyle = fill;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (const { polygon, alpha } of fills) if (alpha >= 1) tracePolygon(ctx, polygon);
  ctx.fill();
  for (const { polygon, alpha } of fills) {
    if (alpha >= 1) continue;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    tracePolygon(ctx, polygon);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawPlanArrows(
  ctx: CanvasRenderingContext2D,
  arrows: readonly DiagramArrow[],
  t: PlanArrowTransform,
  dpr: number,
  sideM: CityModel["sideM"],
  animated: ReadonlySet<DiagramArrow>,
  seconds: number,
): void {
  const mPerPx = 1 / (Math.hypot(t.exX, t.exY) || 1);
  ctx.save();
  ctx.setTransform(dpr * t.exX, dpr * t.exY, dpr * t.enX, dpr * t.enY, dpr * t.ox, dpr * t.oy);
  for (const arrow of arrows) {
    const fill = getColour(ARROW_COLOUR_TOKENS[arrow.colour]);
    const live = liveArrowShape(arrow, sideM, mPerPx, animated.has(arrow) ? seconds : null);
    fillShape(ctx, live.body, fill);
    if (live.comets.length > 0) {
      fillShape(ctx, { ribbons: live.comets, heads: [], polygons: [] }, live.lightComets ? lightenArrowColour(fill).getStyle() : fill);
    }
  }
  ctx.restore();
}

const staticPainters = new WeakMap<HTMLCanvasElement, (target: HTMLCanvasElement) => void>();

export function registerStaticPlanArrows(canvas: HTMLCanvasElement, paint: (target: HTMLCanvasElement) => void): () => void {
  staticPainters.set(canvas, paint);
  return () => {
    if (staticPainters.get(canvas) === paint) staticPainters.delete(canvas);
  };
}

export function staticPlanArrowsSnapshot(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const paint = staticPainters.get(canvas);
  if (!paint) return null;
  const snapshot = canvas.ownerDocument.createElement("canvas");
  paint(snapshot);
  return snapshot;
}
