import type { DataDrivenPropertyValueSpecification } from "maplibre-gl";

export const REACH_HEX_FILL_OPACITY_NEAR = 0.55;
export const REACH_HEX_FILL_OPACITY_FAR = 0.08;
export const REACH_HEX_LINE_OPACITY = 0.14;
export const REACH_ORIGIN_FILL_OPACITY = 0.92;

export function reachHexFillOpacity(minute: number, budgetMin: number): number {
  if (budgetMin <= 1) return REACH_HEX_FILL_OPACITY_NEAR;
  const span = budgetMin - 1;
  const t = Math.max(0, Math.min(1, (minute - 1) / span));
  return REACH_HEX_FILL_OPACITY_NEAR + t * (REACH_HEX_FILL_OPACITY_FAR - REACH_HEX_FILL_OPACITY_NEAR);
}

export function reachHexFillOpacityExpression(
  budgetMin: number,
): DataDrivenPropertyValueSpecification<number> {
  return [
    "case",
    ["==", ["get", "kind"], "origin"],
    REACH_ORIGIN_FILL_OPACITY,
    [
      "interpolate",
      ["linear"],
      ["get", "minute"],
      1,
      REACH_HEX_FILL_OPACITY_NEAR,
      budgetMin,
      REACH_HEX_FILL_OPACITY_FAR,
    ],
  ] as DataDrivenPropertyValueSpecification<number>;
}
