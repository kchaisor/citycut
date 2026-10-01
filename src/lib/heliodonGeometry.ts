import { daylightArcSamples, sunSample, type SolarSample, type Vec3 } from "./solar";

/** World-space ground height (Y) at a plan position (X east, Z = −north). */
export type GroundHeight = (x: number, z: number) => number;

/** Lift above the draped terrain so dial lines clear the road surfaces. */
export const HELIODON_LIFT_M = 1.5;

/**
 * The heliodon's shared projection. Plan position is the orthographic polar
 * chart (radius · cos altitude), so arcs, the horizon ring and the altitude
 * rings line up in plan. Height is the terrain under that plan point plus
 * radius · sin altitude, so altitude 0° lands on the draped horizon ring.
 */
export function heliodonPoint(direction: Vec3, radius: number, ground: GroundHeight): Vec3 {
  const x = direction[0] * radius;
  const z = direction[2] * radius;
  return [x, ground(x, z) + HELIODON_LIFT_M + Math.max(0, direction[1]) * radius, z];
}

/** A point on a flat dial circle at compass bearing `deg` (0° = true north, clockwise). */
export function dialPoint(deg: number, radius: number, ground: GroundHeight): Vec3 {
  const t = (deg * Math.PI) / 180;
  const x = Math.sin(t) * radius;
  const z = -Math.cos(t) * radius;
  return [x, ground(x, z) + HELIODON_LIFT_M, z];
}

/** Plan radius of the altitude ring for `altitudeDeg`, in the same projection as the arcs. */
export function altitudeRingRadius(altitudeDeg: number, radius: number): number {
  return radius * Math.cos((altitudeDeg * Math.PI) / 180);
}

function horizonCrossing(below: SolarSample, above: SolarSample): Vec3 {
  const a = below.direction;
  const b = above.direction;
  const t = a[1] / (a[1] - b[1]);
  const x = a[0] + (b[0] - a[0]) * t;
  const z = a[2] + (b[2] - a[2]) * t;
  const length = Math.hypot(x, z) || 1;
  return [x / length, 0, z / length];
}

/**
 * Sun directions for one day, from the sunrise to the sunset horizon crossing.
 * The ends are interpolated to altitude 0° exactly, so they sit on the horizon ring.
 */
export function horizonArcDirections(
  lat: number,
  lon: number,
  year: number,
  month: number,
  day: number,
  stepMinutes = 5,
): Vec3[] {
  const samples = daylightArcSamples(lat, lon, year, month, day, stepMinutes);
  if (samples.length === 0) return [];
  const step = stepMinutes * 60_000;
  const before = sunSample(lat, lon, new Date(samples[0].date.getTime() - step));
  const after = sunSample(lat, lon, new Date(samples[samples.length - 1].date.getTime() + step));
  const all = [before, ...samples, after];
  const out: Vec3[] = [];
  for (let i = 0; i < all.length; i++) {
    const sample = all[i];
    if (!sample.aboveHorizon) continue;
    const previous = all[i - 1];
    if (previous && !previous.aboveHorizon) out.push(horizonCrossing(previous, sample));
    out.push(sample.direction);
    const next = all[i + 1];
    if (next && !next.aboveHorizon) out.push(horizonCrossing(next, sample));
  }
  return out;
}
