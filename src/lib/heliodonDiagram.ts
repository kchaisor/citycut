import { getColour } from "./colours";
import { altitudeRingRadius, horizonArcDirections } from "./heliodonGeometry";
import { HELIODON_RADIUS_FACTOR_DEFAULT, heliodonRadiusM } from "./heliodonRadius";
import { HELIODON_LABELLED_HOURS, SUN_PATH_STYLES } from "./heliodonSunPaths";
import {
  daylightHourMarks,
  melbourneLocalToUtc,
  sunSample,
  type Vec3,
} from "./solar";
import type { Pt } from "../types";

/** Sun-path diagram radius on drawings: fraction of the square frame side (not ground metres at 3D scale). */
export const HELIODON_DIAGRAM_RADIUS_FRACTION = 0.45;

/** 2D plan dial radius; default factor matches the historical 0.45 × side look. */
export function heliodonDiagramRadiusM(
  sideM: number,
  radiusFactor = HELIODON_RADIUS_FACTOR_DEFAULT,
): number {
  const scaled = sideM * HELIODON_DIAGRAM_RADIUS_FRACTION * (radiusFactor / HELIODON_RADIUS_FACTOR_DEFAULT);
  const max = sideM * 0.48;
  const min = sideM * 0.12;
  return Math.min(max, Math.max(min, scaled));
}

/** ~6.5 pt on paper at `planScale`, in plan viewBox metres. */
export function heliodonLabelFontMetres(planScale: number, pt = 6.5): number {
  const mm = (pt * 25.4) / 72;
  return (mm / 1000) * planScale;
}

export type HeliodonDiagramInput = {
  lat: number;
  lon: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  sideM: number;
  radiusFactor?: number;
};

export type HeliodonDiagramTick = { a: Pt; b: Pt; tier: "minor" | "medium" | "major" };

export type HeliodonDiagramOverlay = {
  radiusM: number;
  horizonRing: Pt[];
  altitudeRings: Pt[][];
  ticks: HeliodonDiagramTick[];
  degreeLabels: { text: string; east: number; north: number }[];
  cardinals: { text: string; east: number; north: number; weight: number; fontPt: number }[];
  arcs: { points: Pt[]; colour: string; dash?: string }[];
  hourLines: Pt[][];
  hourDots: Pt[];
  hourLabels: { text: string; east: number; north: number }[];
  arcLabels: { text: string; east: number; north: number }[];
  sun: Pt | null;
};

function dialEastNorth(deg: number, radius: number): Pt {
  const t = (deg * Math.PI) / 180;
  return [Math.sin(t) * radius, Math.cos(t) * radius];
}

function planFromDirection(direction: Vec3, radius: number): Pt {
  return [direction[0] * radius, -direction[2] * radius];
}

function circlePoints(radius: number, stepDeg = 2): Pt[] {
  const points: Pt[] = [];
  for (let deg = 0; deg <= 360; deg += stepDeg) points.push(dialEastNorth(deg, radius));
  return points;
}

function outward(from: Pt, by: number): Pt {
  const length = Math.hypot(from[0], from[1]) || 1;
  return [(from[0] / length) * by, (from[1] / length) * by];
}

function dashForDiagram(pattern: readonly number[] | null, radius: number): string | undefined {
  if (!pattern) return undefined;
  return pattern.map((fraction) => (fraction * radius * 2.4).toFixed(2)).join(" ");
}

function buildHeliodonOverlayAtRadius(input: HeliodonDiagramInput, R: number): HeliodonDiagramOverlay {
  const { lat, lon, year } = input;
  const horizonRing = circlePoints(R, 1);
  const altitudeRings = [30, 60].map((alt) => circlePoints(altitudeRingRadius(alt, R), 2));

  const ticks: HeliodonDiagramTick[] = [];
  for (let deg = 0; deg < 360; deg += 1) {
    const onRing = dialEastNorth(deg, R);
    let length = R * 0.028;
    let tier: HeliodonDiagramTick["tier"] = "minor";
    if (deg % 90 === 0) {
      length = R * 0.11;
      tier = "major";
    } else if (deg % 10 === 0) {
      length = R * 0.075;
      tier = "major";
    } else if (deg % 5 === 0) {
      length = R * 0.048;
      tier = "medium";
    }
    const out = outward(onRing, length);
    ticks.push({ a: onRing, b: [onRing[0] + out[0], onRing[1] + out[1]], tier });
  }

  const degreeLabels: HeliodonDiagramOverlay["degreeLabels"] = [];
  for (let deg = 10; deg < 360; deg += 10) {
    if (deg % 90 === 0) continue;
    const at = dialEastNorth(deg, R + R * 0.12);
    degreeLabels.push({ text: `${deg}°`, east: at[0], north: at[1] });
  }

  const cardinals: HeliodonDiagramOverlay["cardinals"] = (
    [
      ["N", 0, 0.14, 800, 8.5],
      ["E", 90, 0.14, 650, 7],
      ["S", 180, 0.14, 650, 7],
      ["W", 270, 0.14, 650, 7],
    ] as const
  ).map(([text, deg, offset, weight, pt]) => {
    const at = dialEastNorth(deg, R + R * offset);
    return { text, east: at[0], north: at[1], weight, fontPt: pt };
  });

  const hourDirections = new Map<number, Vec3[]>();
  const arcs: HeliodonDiagramOverlay["arcs"] = [];
  const hourDots: Pt[] = [];
  const hourLabels: HeliodonDiagramOverlay["hourLabels"] = [];
  const arcLabels: HeliodonDiagramOverlay["arcLabels"] = [];

  for (const style of SUN_PATH_STYLES) {
    const { month, day } = style.date;
    const directions = horizonArcDirections(lat, lon, year, month, day, 5);
    const points = directions.map((direction) => planFromDirection(direction, R));
    if (points.length >= 2) {
      arcs.push({
        points,
        colour: getColour(style.key),
        dash: dashForDiagram(style.pattern, R),
      });
    }

    for (const mark of daylightHourMarks(lat, lon, year, month, day)) {
      const at = planFromDirection(mark.sample.direction, R);
      const list = hourDirections.get(mark.hour) ?? [];
      list.push(mark.sample.direction);
      hourDirections.set(mark.hour, list);
      hourDots.push(at);
      if (HELIODON_LABELLED_HOURS.has(mark.hour)) {
        const push = outward(at, style.labelSide * R * 0.05);
        hourLabels.push({ text: `${mark.hour}h`, east: at[0] + push[0], north: at[1] + push[1] });
      }
    }

    if (points.length >= 2) {
      const spot = (point: Pt) => {
        const push = outward(point, R * 0.07);
        return [point[0] + push[0], point[1] + push[1] + R * 0.08] as Pt;
      };
      const endSpot = spot(points[points.length - 1]);
      arcLabels.push({ text: style.label, east: endSpot[0], north: endSpot[1] });
    }
  }

  const hourLines: Pt[][] = [];
  for (const directions of hourDirections.values()) {
    if (directions.length < 2) continue;
    const samples: Pt[] = [];
    const steps = directions.length * 12;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const index = t * (directions.length - 1);
      const i0 = Math.floor(index);
      const i1 = Math.min(directions.length - 1, i0 + 1);
      const mix = index - i0;
      const a = directions[i0];
      const b = directions[i1];
      const dir: Vec3 = [a[0] + (b[0] - a[0]) * mix, a[1] + (b[1] - a[1]) * mix, a[2] + (b[2] - a[2]) * mix];
      const length = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      samples.push(planFromDirection([dir[0] / length, dir[1] / length, dir[2] / length], R));
    }
    hourLines.push(samples);
  }

  const sample = sunSample(lat, lon, melbourneLocalToUtc(input.year, input.month, input.day, input.hour, input.minute));
  const sun = sample.aboveHorizon ? planFromDirection(sample.direction, R) : null;

  return {
    radiusM: R,
    horizonRing,
    altitudeRings,
    ticks,
    degreeLabels,
    cardinals,
    arcs,
    hourLines,
    hourDots,
    hourLabels,
    arcLabels,
    sun,
  };
}

export function buildHeliodonDiagramOverlay(input: HeliodonDiagramInput): HeliodonDiagramOverlay {
  return buildHeliodonOverlayAtRadius(
    input,
    heliodonDiagramRadiusM(input.sideM, input.radiusFactor ?? HELIODON_RADIUS_FACTOR_DEFAULT),
  );
}

export type HeliodonDiagramExportOptions = HeliodonDiagramInput;

/** Rhino / 3D-scale export in ground metres. */
export type HeliodonGroundExportOptions = HeliodonDiagramInput & { radiusFactor: number };

export function buildHeliodonGroundOverlay(input: HeliodonGroundExportOptions): HeliodonDiagramOverlay {
  return buildHeliodonOverlayAtRadius(input, heliodonRadiusM(input.sideM, input.radiusFactor));
}
