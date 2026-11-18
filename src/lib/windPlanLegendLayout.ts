export type HudRect = { left: number; top: number; right: number; bottom: number };

export type WindPlanLegendInput = {
  viewW: number;
  viewH: number;
  cardW: number;
  chromeH: number;
  inset: number;
  gap: number;
  topLimit: number;
  barMax: number;
  barMin: number;
  inspector: HudRect | null;
  floors: HudRect[];
};

export type WindPlanLegendPlacement = { right: number; bottom: number; barPx: number };

export const WIND_PLAN_LEGEND_BAR_MAX_PX = 200;
export const WIND_PLAN_LEGEND_BAR_MIN_PX = 96;
export const WIND_PLAN_HUD_GAP_PX = 8;
export const WIND_PLAN_HUD_EVENT = "citycut:wind-plan-hud";

function overlapsX(rect: HudRect, x0: number, x1: number): boolean {
  return rect.right > x0 && rect.left < x1;
}

function column(input: WindPlanLegendInput, x1: number, ceiling: number) {
  const x0 = x1 - input.cardW;
  let floor = input.viewH - input.inset;
  for (const rect of input.floors) {
    if (overlapsX(rect, x0 - input.gap, x1 + input.gap)) floor = Math.min(floor, rect.top - input.gap);
  }
  let top = Math.max(input.topLimit, ceiling);
  if (input.inspector && overlapsX(input.inspector, x0 - input.gap, x1 + input.gap)) {
    top = Math.max(top, input.inspector.bottom + input.gap);
  }
  return { x1, floor, room: floor - top - input.chromeH };
}

export function placeWindPlanLegend(input: WindPlanLegendInput): WindPlanLegendPlacement {
  const right = column(input, input.viewW - input.inset, input.topLimit);
  let pick = right;
  if (right.room < input.barMin && input.inspector) {
    const beside = column(input, input.inspector.left - input.gap, input.topLimit);
    if (beside.room > right.room) pick = beside;
  }
  return {
    right: Math.round(input.viewW - pick.x1),
    bottom: Math.round(input.viewH - pick.floor),
    barPx: Math.round(Math.max(input.barMin, Math.min(input.barMax, pick.room))),
  };
}
