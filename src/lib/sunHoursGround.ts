import { getColour, type ColourKey } from "./colours";
import { cssColorToHex } from "./cssVars";

export const SUN_HOURS_GROUND_CELL_M = 3;
export const SUN_HOURS_GROUND_STEP_MINUTES = 15;

const DIRECT_PALETTE_STOPS: { t: number; key: ColourKey }[] = [
  { t: 0, key: "--sun-hours-direct-0" },
  { t: 0.12, key: "--sun-hours-direct-15" },
  { t: 0.28, key: "--sun-hours-direct-30" },
  { t: 0.45, key: "--sun-hours-direct-50" },
  { t: 0.62, key: "--sun-hours-direct-70" },
  { t: 0.82, key: "--sun-hours-direct-90" },
  { t: 1, key: "--sun-hours-direct-max" },
];

function parseHexRgb(hex: string): [number, number, number] | null {
  const normalized = cssColorToHex(hex);
  if (!normalized || normalized.length !== 7) return null;
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function paletteChannels(): { t: number; rgb: [number, number, number] }[] {
  return DIRECT_PALETTE_STOPS.map((stop) => {
    const rgb = parseHexRgb(getColour(stop.key));
    if (!rgb) throw new Error(`Missing direct sun hours colour ${stop.key}`);
    return { t: stop.t, rgb };
  });
}

export function sunHoursGroundFromLitSteps(litSteps: number, stepMinutes = SUN_HOURS_GROUND_STEP_MINUTES): number {
  return (litSteps * stepMinutes) / 60;
}

export function sunHoursGroundPaletteEndpointKeys(): { minKey: ColourKey; maxKey: ColourKey } {
  return { minKey: "--sun-hours-direct-0", maxKey: "--sun-hours-direct-max" };
}

export function sunHoursDirectRgb(hours: number, maxHours: number): [number, number, number] {
  const [r, g, b] = sunHoursGroundRgba(hours, maxHours, false);
  return [r / 255, g / 255, b / 255];
}

export function sunHoursGroundRgba(
  hours: number,
  maxHours: number,
  masked: boolean,
): [number, number, number, number] {
  if (masked || hours < 0) return [0, 0, 0, 0];
  const stops = paletteChannels();
  const t = maxHours > 0 ? Math.min(1, Math.max(0, hours / maxHours)) : 0;
  let lower = stops[0]!;
  let upper = stops[stops.length - 1]!;
  for (let index = 0; index < stops.length - 1; index++) {
    const a = stops[index]!;
    const b = stops[index + 1]!;
    if (t >= a.t && t <= b.t) {
      lower = a;
      upper = b;
      break;
    }
  }
  const span = upper.t - lower.t || 1;
  const mix = (t - lower.t) / span;
  const rgb: [number, number, number] = [
    Math.round(lower.rgb[0]! + (upper.rgb[0]! - lower.rgb[0]!) * mix),
    Math.round(lower.rgb[1]! + (upper.rgb[1]! - lower.rgb[1]!) * mix),
    Math.round(lower.rgb[2]! + (upper.rgb[2]! - lower.rgb[2]!) * mix),
  ];
  const alpha = Math.round(228 + 22 * t);
  return [rgb[0]!, rgb[1]!, rgb[2]!, alpha];
}
