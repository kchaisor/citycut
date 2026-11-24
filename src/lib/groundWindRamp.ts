import type { ColourKey } from "./colours";

export type GroundWindRampStop = { token: ColourKey; speed: number; legendAt: number };

export type GroundWindLegendStop = { token: ColourKey; speed: number; pct: number };

export function groundWindLegendStops(): GroundWindLegendStop[] {
  return GROUND_WIND_RAMP.map((stop) => ({ token: stop.token, speed: stop.speed, pct: stop.legendAt * 100 }));
}

export const GROUND_WIND_RAMP: readonly GroundWindRampStop[] = [
  { token: "--ground-wind-sheltered", speed: 0.15, legendAt: 0 },
  { token: "--ground-wind-calm", speed: 0.45, legendAt: 0.2 },
  { token: "--ground-wind-easing", speed: 0.8, legendAt: 0.38 },
  { token: "--ground-wind-open", speed: 1, legendAt: 0.5 },
  { token: "--ground-wind-rising", speed: 1.12, legendAt: 0.68 },
  { token: "--ground-wind-fast", speed: 1.25, legendAt: 0.84 },
  { token: "--ground-wind-speeding", speed: 1.4, legendAt: 1 },
];
