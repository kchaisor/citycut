import { getColour } from "./colours";
import { altitudeRingRadius, horizonArcDirections } from "./heliodonGeometry";
import { heliodonRadiusM } from "./heliodonRadius";
import { HELIODON_LABELLED_HOURS, SUN_PATH_STYLES, sunPathDashMetres } from "./heliodonSunPaths";
import {
  daylightHourMarks,
  melbourneLocalToUtc,
  sunSample,
  type Vec3,
} from "./solar";
import type { Pt } from "../types";

export type HeliodonPlanInput = {
  lat: number;
  lon: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  sideM: number;
  radiusFactor: number;
};

export type HeliodonPlanTick = { a: Pt; b: Pt; tier: "minor" | "medium" | "major" };

export type HeliodonPlanOverlay = {
  radiusM: number;
  horizonRing: Pt[];
  altitudeRings: Pt[][];
  ticks: HeliodonPlanTick[];
  degreeLabels: { text: string; east: number; north: number }[];
  cardinals: { text: string; east: number; north: number; weight: number; size: number }[];
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

export function buildHeliodonPlanOverlay(input: HeliodonPlanInput): HeliodonPlanOverlay {
  const { lat, lon, year, sideM, radiusFactor } = input;
  const R = heliodonRadiusM(sideM, radiusFactor);
  const horizonRing = circlePoints(R, 1);
  const altitudeRings = [30, 60].map((alt) => circlePoints(altitudeRingRadius(alt, R), 2));

  const ticks: HeliodonPlanTick[] = [];
  for (let deg = 0; deg < 360; deg += 1) {
    const onRing = dialEastNorth(deg, R);
    let length = sideM * 0.012;
    let tier: HeliodonPlanTick["tier"] = "minor";
    if (deg % 90 === 0) {
      length = sideM * 0.05;
      tier = "major";
    } else if (deg % 10 === 0) {
      length = sideM * 0.034;
      tier = "major";
    } else if (deg % 5 === 0) {
      length = sideM * 0.022;
      tier = "medium";
    }
    const out = outward(onRing, length);
    ticks.push({ a: onRing, b: [onRing[0] + out[0], onRing[1] + out[1]], tier });
  }

  const degreeLabels: HeliodonPlanOverlay["degreeLabels"] = [];
  for (let deg = 10; deg < 360; deg += 10) {
    if (deg % 90 === 0) continue;
    const at = dialEastNorth(deg, R + sideM * 0.056);
    degreeLabels.push({ text: `${deg}°`, east: at[0], north: at[1] });
  }

  const cardinals: HeliodonPlanOverlay["cardinals"] = (
    [
      ["N", 0, 0.088, 800, 0.062],
      ["E", 90, 0.088, 650, 0.045],
      ["S", 180, 0.088, 650, 0.045],
      ["W", 270, 0.088, 650, 0.045],
    ] as const
  ).map(([text, deg, offset, weight, size]) => {
    const at = dialEastNorth(deg, R + sideM * offset);
    return { text, east: at[0], north: at[1], weight, size };
  });

  const hourDirections = new Map<number, Vec3[]>();
  const arcs: HeliodonPlanOverlay["arcs"] = [];
  const hourDots: Pt[] = [];
  const hourLabels: HeliodonPlanOverlay["hourLabels"] = [];
  const arcLabels: HeliodonPlanOverlay["arcLabels"] = [];

  for (const style of SUN_PATH_STYLES) {
    const { month, day } = style.date;
    const directions = horizonArcDirections(lat, lon, year, month, day, 5);
    const points = directions.map((direction) => planFromDirection(direction, R));
    if (points.length >= 2) {
      arcs.push({
        points,
        colour: getColour(style.key),
        dash: sunPathDashMetres(sideM, style.pattern),
      });
    }

    for (const mark of daylightHourMarks(lat, lon, year, month, day)) {
      const at = planFromDirection(mark.sample.direction, R);
      const list = hourDirections.get(mark.hour) ?? [];
      list.push(mark.sample.direction);
      hourDirections.set(mark.hour, list);
      hourDots.push(at);
      if (HELIODON_LABELLED_HOURS.has(mark.hour)) {
        const push = outward(at, style.labelSide * sideM * 0.024);
        hourLabels.push({ text: `${mark.hour}h`, east: at[0] + push[0], north: at[1] + push[1] });
      }
    }

    if (points.length >= 2) {
      const spot = (point: Pt) => {
        const push = outward(point, sideM * 0.035);
        return [point[0] + push[0], point[1] + push[1] + sideM * 0.04] as Pt;
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

export type HeliodonPlanExportOptions = HeliodonPlanInput;
