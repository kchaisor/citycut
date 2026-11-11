export const REACH_H3_RES = 10;
export const REACH_WALK_KMH = 4.8;
export const REACH_WALK_MPM = (REACH_WALK_KMH * 1000) / 60;
export const REACH_BUDGET_MIN = 5;
export const REACH_BUDGET_MAX = 30;
export const REACH_BUDGET_DEFAULT = 15;
export const REACH_HEX_AREA_KM2 = 0.01760557922732479;
export const MELBOURNE_CBD = { lat: -37.8136, lon: 144.9631 };
export const REACH_RADIUS_KM = 12;
export const REACH_UNREACHABLE = 255;
export const REACH_MAX_TRAVEL_MIN = 30;

export type ReachPeriod = "weekday_am" | "midday" | "weekend";

export const REACH_PERIODS: { id: ReachPeriod; label: string }[] = [
  { id: "weekday_am", label: "Weekday AM" },
  { id: "midday", label: "Midday" },
  { id: "weekend", label: "Weekend" },
];

export type DemographicsExplorerLens = "people" | "reach";
