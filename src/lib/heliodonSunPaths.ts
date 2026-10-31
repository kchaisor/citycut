import { SOLAR_EQUINOX, SOLAR_SUMMER, SOLAR_WINTER } from "./solar";
import type { ColourKey } from "./colours";

export const SUN_PATH_STYLES = [
  { date: SOLAR_SUMMER, label: "Dec 22", key: "--sun-arc-summer" as ColourKey, pattern: null as readonly number[] | null, labelSide: 1 },
  { date: SOLAR_EQUINOX, label: "Sep/Mar", key: "--sun-arc-equinox" as ColourKey, pattern: [0.018, 0.011], labelSide: -1 },
  { date: SOLAR_WINTER, label: "Jun 21", key: "--sun-arc-winter" as ColourKey, pattern: [0.024, 0.009, 0.004, 0.009], labelSide: -1 },
] as const;

export const HELIODON_LABELLED_HOURS = new Set([6, 9, 12, 15, 18]);

export function sunPathDashMetres(sideM: number, pattern: readonly number[] | null): string | undefined {
  if (!pattern) return undefined;
  return pattern.map((fraction) => (fraction * sideM).toFixed(2)).join(" ");
}
