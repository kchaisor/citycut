import {
  HELIODON_LIFT_M,
  heliodonPoint,
  horizonArcDirections,
  type GroundHeight,
} from "./heliodonGeometry";
import { SUN_PATH_STYLES } from "./heliodonSunPaths";
import { melbourneLocalToUtc, sunSample } from "./solar";
import {
  add,
  cameraBasis,
  cornersOf,
  dot,
  normalize,
  scale,
  sub,
  type Aabb,
  type Vec3,
} from "./isoCamera";

/** Margin when fitting the perspective camera to the heliodon. */
export const HELIODON_FIT_MARGIN = 1.24;

/** Default orbit direction (target → eye), matching the original CityCut perspective. */
export const DEFAULT_PERSPECTIVE_OFFSET: Vec3 = normalize([0.78, 0.6, 0.86]);

export function siteBounds(sideM: number, groundY: number, siteTopY: number): Aabb {
  const half = sideM / 2;
  return {
    min: [-half, groundY, -half],
    max: [half, Math.max(siteTopY, groundY + 1), half],
  };
}

export function unionAabb(a: Aabb, b: Aabb): Aabb {
  return {
    min: [
      Math.min(a.min[0], b.min[0]),
      Math.min(a.min[1], b.min[1]),
      Math.min(a.min[2], b.min[2]),
    ],
    max: [
      Math.max(a.max[0], b.max[0]),
      Math.max(a.max[1], b.max[1]),
      Math.max(a.max[2], b.max[2]),
    ],
  };
}

export type HeliodonFramingInput = {
  lat: number;
  lon: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  sideM: number;
  ringRadiusM: number;
  groundY: number;
  siteTopY: number;
};

/** World-space box that contains the site, horizon ring, labels, arcs, and the sun icon. */
export function heliodonSceneBounds(input: HeliodonFramingInput): Aabb {
  const { sideM, ringRadiusM, groundY, siteTopY } = input;
  const ground: GroundHeight = () => groundY;
  const labelPad = Math.max(ringRadiusM * 0.14, sideM * 0.1);
  const horizontal = ringRadiusM + labelPad;
  let minY = groundY;
  let maxY = Math.max(siteTopY, groundY + HELIODON_LIFT_M + 2);

  for (const style of SUN_PATH_STYLES) {
    const directions = horizonArcDirections(input.lat, input.lon, input.year, style.date.month, style.date.day, 5);
    for (const direction of directions) {
      const [, y] = heliodonPoint(direction, ringRadiusM, ground);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + sideM * 0.04);
    }
  }

  const sample = sunSample(
    input.lat,
    input.lon,
    melbourneLocalToUtc(input.year, input.month, input.day, input.hour, input.minute),
  );
  if (sample.aboveHorizon) {
    const [, sunY] = heliodonPoint(sample.direction, ringRadiusM, ground);
    maxY = Math.max(maxY, sunY + sideM * 0.12);
  }

  const site = siteBounds(sideM, groundY, siteTopY);
  const dome: Aabb = {
    min: [-horizontal, minY, -horizontal],
    max: [horizontal, maxY, horizontal],
  };
  return unionAabb(site, dome);
}

function fitsFrustum(
  bounds: Aabb,
  target: Vec3,
  eyeOffsetUnit: Vec3,
  distance: number,
  fovVerticalDeg: number,
  aspect: number,
  margin: number,
): boolean {
  const eye = add(target, scale(eyeOffsetUnit, distance));
  const forward = normalize(sub(target, eye));
  const { right, up } = cameraBasis(sub(eye, target));
  const vHalf = (fovVerticalDeg * Math.PI) / 180 / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  for (const corner of cornersOf(bounds)) {
    const view = sub(corner, eye);
    const depth = dot(view, forward);
    if (depth <= 1e-3) return false;
    const x = Math.abs(dot(view, right));
    const y = Math.abs(dot(view, up));
    if (x > depth * Math.tan(hHalf) * margin) return false;
    if (y > depth * Math.tan(vHalf) * margin) return false;
  }
  return true;
}

/** Smallest distance along `eyeOffsetUnit` from `target` that fits `bounds` in a perspective frustum. */
export function perspectiveFitDistance(
  bounds: Aabb,
  target: Vec3,
  eyeOffsetUnit: Vec3,
  fovVerticalDeg: number,
  aspect: number,
  margin = HELIODON_FIT_MARGIN,
): number {
  let lo = 1;
  let hi = Math.max(500, boundingSpan(bounds) * 4);
  while (!fitsFrustum(bounds, target, eyeOffsetUnit, hi, fovVerticalDeg, aspect, margin)) {
    hi *= 1.6;
    if (hi > 1e7) break;
  }
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (fitsFrustum(bounds, target, eyeOffsetUnit, mid, fovVerticalDeg, aspect, margin)) hi = mid;
    else lo = mid;
  }
  return hi;
}

function boundingSpan(bounds: Aabb): number {
  return Math.hypot(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
}

export function defaultPerspectiveDistance(sideM: number): number {
  return sideM * Math.hypot(DEFAULT_PERSPECTIVE_OFFSET[0], DEFAULT_PERSPECTIVE_OFFSET[1], DEFAULT_PERSPECTIVE_OFFSET[2]);
}

export function defaultPerspectiveTarget(sideM: number, lift: number): Vec3 {
  return [0, lift + sideM * 0.02, 0];
}
