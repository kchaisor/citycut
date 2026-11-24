import { HELIODON_LIFT_M, horizonArcDirections } from "./heliodonGeometry";
import type { Aabb } from "./isoCamera";
import { SOLAR_EQUINOX, SOLAR_SUMMER, SOLAR_WINTER } from "./solar";

export type SunDomeLineStyle = {
  widthPx: number;
  ink: "--ink" | "--ink-3";
  opacity: number;
  dashPx: readonly [number, number] | null;
};

export const SUN_DOME_SELECTED_LINE: SunDomeLineStyle = { widthPx: 2, ink: "--ink", opacity: 1, dashPx: null };
export const SUN_DOME_HOUR_LINE: SunDomeLineStyle = { widthPx: 0.75, ink: "--ink", opacity: 0.35, dashPx: null };
export const SUN_DOME_HORIZON_LINE: SunDomeLineStyle = { widthPx: 1, ink: "--ink", opacity: 0.25, dashPx: null };

const keyDateLine = (dashPx: readonly [number, number]): SunDomeLineStyle => ({ widthPx: 1, ink: "--ink-3", opacity: 1, dashPx });

export const SUN_DOME_KEY_DATES = [
  { id: "winter", date: SOLAR_WINTER, keyLabel: "21 Jun", dateLabel: "21 Jun", line: keyDateLine([6, 4]) },
  { id: "summer", date: SOLAR_SUMMER, keyLabel: "22 Dec", dateLabel: "22 Dec", line: keyDateLine([2, 3]) },
  { id: "equinox", date: SOLAR_EQUINOX, keyLabel: "Equinox", dateLabel: null, line: keyDateLine([2, 4]) },
] as const;

export const SUN_DOME_HOUR_LABELS = [9, 12, 15] as const;
export const SUN_DOME_TICK_STEP_DEG = 10;
export const SUN_DOME_TICK_PX = 4;
export const SUN_DOME_LABEL_STEP_DEG = 30;
export const SUN_DOME_LABEL_GAP_PX = 6;
export const SUN_DOME_HALO_PX = 2;
export const SUN_DOME_BEARING_SIZE_PX = 10;
export const SUN_DOME_CARDINAL_SIZE_PX = 20;
export const SUN_DOME_SUN_PX = 14;
export const SUN_DOME_SUN_LINE: SunDomeLineStyle = { widthPx: 1, ink: "--ink", opacity: 1, dashPx: [4, 3] };
export const SUN_DOME_SAFE_PAD_PX = 16;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function sunDomeDateLabel(month: number, day: number): string {
  return `${day} ${MONTHS[month - 1] ?? ""}`.trim();
}

export function sunDomeHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}h`;
}

export function sunDomeBearingLabels(): { deg: number; text: string; cardinal: boolean }[] {
  const cardinals: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };
  const labels: { deg: number; text: string; cardinal: boolean }[] = [];
  for (let deg = 0; deg < 360; deg += SUN_DOME_LABEL_STEP_DEG) {
    const cardinal = cardinals[deg];
    labels.push({ deg, text: cardinal ?? String(deg), cardinal: Boolean(cardinal) });
  }
  return labels;
}

export type SunDomeArc = {
  month: number;
  day: number;
  selected: boolean;
  line: SunDomeLineStyle;
  dateLabel: string | null;
  hourLabels: readonly number[];
};

export function sunDomeArcs(selected: { month: number; day: number }): SunDomeArc[] {
  const arcs: SunDomeArc[] = [
    {
      month: selected.month,
      day: selected.day,
      selected: true,
      line: SUN_DOME_SELECTED_LINE,
      dateLabel: sunDomeDateLabel(selected.month, selected.day),
      hourLabels: SUN_DOME_HOUR_LABELS,
    },
  ];
  for (const key of SUN_DOME_KEY_DATES) {
    if (key.date.month === selected.month && key.date.day === selected.day) continue;
    arcs.push({
      month: key.date.month,
      day: key.date.day,
      selected: false,
      line: key.line,
      dateLabel: key.dateLabel,
      hourLabels: [],
    });
  }
  return arcs;
}

export function sunDomeSunLinePositions(
  sunAt: { x: number; y: number; z: number },
  centre: { x: number; y: number; z: number },
): [number, number, number, number, number, number] {
  return [sunAt.x, sunAt.y, sunAt.z, centre.x, centre.y, centre.z];
}

export type ScreenRect = { left: number; top: number; right: number; bottom: number };

export function hudSafeArea(viewport: ScreenRect, huds: readonly ScreenRect[], pad = SUN_DOME_SAFE_PAD_PX): ScreenRect {
  const safe = { ...viewport };
  const width = viewport.right - viewport.left;
  const height = viewport.bottom - viewport.top;
  for (const hud of huds) {
    if (hud.right <= viewport.left || hud.left >= viewport.right || hud.bottom <= viewport.top || hud.top >= viewport.bottom) continue;
    const gaps = [
      { side: "left", gap: hud.left - viewport.left, share: (hud.right - viewport.left) / width },
      { side: "right", gap: viewport.right - hud.right, share: (viewport.right - hud.left) / width },
      { side: "top", gap: hud.top - viewport.top, share: (hud.bottom - viewport.top) / height },
      { side: "bottom", gap: viewport.bottom - hud.bottom, share: (viewport.bottom - hud.top) / height },
    ].filter((entry) => entry.share < 0.5);
    if (gaps.length === 0) continue;
    const nearest = gaps.reduce((best, entry) => (entry.gap < best.gap ? entry : best));
    if (nearest.side === "left") safe.left = Math.max(safe.left, hud.right + pad);
    else if (nearest.side === "right") safe.right = Math.min(safe.right, hud.left - pad);
    else if (nearest.side === "top") safe.top = Math.max(safe.top, hud.bottom + pad);
    else safe.bottom = Math.min(safe.bottom, hud.top - pad);
  }
  if (safe.right - safe.left < width * 0.25 || safe.bottom - safe.top < height * 0.25) return viewport;
  return safe;
}

export function sunDomeBounds(input: {
  lat: number;
  lon: number;
  year: number;
  selected: { month: number; day: number };
  radiusM: number;
  groundY: number;
}): Aabb {
  const half = input.radiusM;
  let peak = 0;
  for (const arc of sunDomeArcs(input.selected)) {
    for (const direction of horizonArcDirections(input.lat, input.lon, input.year, arc.month, arc.day, 15)) {
      peak = Math.max(peak, direction[1]);
    }
  }
  return {
    min: [-half, input.groundY, -half],
    max: [half, input.groundY + HELIODON_LIFT_M + peak * input.radiusM, half],
  };
}
