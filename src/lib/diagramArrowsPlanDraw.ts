import type { CityModel } from "../types";
import { getColour } from "./colours";
import { ARROW_COLOUR_TOKENS, buildArrowShape, ribbonPolygon, type ArrowShape, type DiagramArrow } from "./diagramArrows";
import { animatedArrowShape, lightenArrowColour } from "./diagramArrowsMotion";

export type PlanArrowTransform = { ox: number; oy: number; exX: number; exY: number; enX: number; enY: number };

const STREAK_OPACITY = 0.9;

function fillShape(ctx: CanvasRenderingContext2D, shape: ArrowShape, fill: string, alpha: number): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (const polygon of [...shape.ribbons.map(ribbonPolygon), ...shape.heads]) {
    polygon.forEach(([east, north], index) => (index === 0 ? ctx.moveTo(east, north) : ctx.lineTo(east, north)));
    ctx.closePath();
  }
  ctx.fill();
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
    if (!animated.has(arrow)) {
      fillShape(ctx, buildArrowShape(arrow.points, arrow.style, arrow.width, sideM, mPerPx), fill, 1);
      continue;
    }
    const live = animatedArrowShape(arrow, sideM, mPerPx, seconds);
    if (arrow.animation === "streaks") {
      fillShape(ctx, buildArrowShape(arrow.points, arrow.style, arrow.width, sideM, mPerPx), fill, 1);
      fillShape(ctx, { ribbons: live.streaks, heads: [] }, lightenArrowColour(fill).getStyle(), STREAK_OPACITY);
    } else {
      fillShape(ctx, live.body, fill, 1);
    }
  }
  ctx.restore();
}
