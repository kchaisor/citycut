import { getColour } from "./colours";

export const CALM_SPEED_KMH = 2;
export const CALM_SPEED_MS = CALM_SPEED_KMH / 3.6;
export const EPW_WIND_SPEED_MISSING = 999;
export const EPW_WIND_DIR_MISSING = 999;

export const WIND_SPEED_BIN_EDGES_MS = [
  CALM_SPEED_MS,
  10 / 3.6,
  20 / 3.6,
  30 / 3.6,
  40 / 3.6,
  100,
] as const;

export const WIND_BAND_COLOUR_VARS = [
  "--wind-band-0",
  "--wind-band-1",
  "--wind-band-2",
  "--wind-band-3",
  "--wind-band-4",
] as const;

export const WIND_SPEED_LEGEND_TICKS_KMH = ["2", "10", "20", "30", "40+"] as const;

export const WIND_SPEED_CONSOLE_CHIP_LABELS = [
  `${WIND_SPEED_LEGEND_TICKS_KMH[0]}–${WIND_SPEED_LEGEND_TICKS_KMH[1]} km/h`,
  `${WIND_SPEED_LEGEND_TICKS_KMH[1]}–${WIND_SPEED_LEGEND_TICKS_KMH[2]}`,
  `${WIND_SPEED_LEGEND_TICKS_KMH[2]}–${WIND_SPEED_LEGEND_TICKS_KMH[3]}`,
  `${WIND_SPEED_LEGEND_TICKS_KMH[3]}–${WIND_SPEED_LEGEND_TICKS_KMH[4]}`,
  `${WIND_SPEED_LEGEND_TICKS_KMH[4]} km/h`,
] as const;

export function windSpeedBinRangeLabel(band: number): string {
  return WIND_SPEED_CONSOLE_CHIP_LABELS[band] ?? WIND_SPEED_CONSOLE_CHIP_LABELS[4]!;
}

export function windSpeedLegendTickLine(): string {
  return `${WIND_SPEED_LEGEND_TICKS_KMH.join(" · ")} km/h`;
}

export function windBandFill(band: number): string {
  return getColour(WIND_BAND_COLOUR_VARS[band] ?? WIND_BAND_COLOUR_VARS[4]);
}

export function formatCalmPercent(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

export function windRoseCalmCaption(calmPct: number): string {
  const calm = formatCalmPercent(calmPct);
  if (calmPct >= 30) {
    return `Calm ${calm} · petals show the other ${formatCalmPercent(100 - calmPct)}`;
  }
  return `Calm ${calm}`;
}