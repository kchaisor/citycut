/**
 * True isometric camera for the CityCut scene.
 *
 * Three.js is Y-up here: +X is east, +Y is up, and +Z is south (−north).
 * A true isometric view sits at elevation arctan(1/√2) above the horizontal
 * and at 45° between the ground axes, so east, up, and north are equally
 * foreshortened. The four corners are the same angles with the signs of
 * east and north flipped.
 *
 * SW is the default. The camera is south-west of the frame and looks
 * north-east, which puts the Yarra side of the Melbourne CBD frame on the
 * near edge.
 */

export const ISO_CORNERS = ["ne", "nw", "se", "sw"] as const;

export type IsoCorner = (typeof ISO_CORNERS)[number];

export const DEFAULT_ISO_CORNER: IsoCorner = "sw";

/** arctan(1/√2), about 35.264°. */
export const ISO_ELEVATION_RAD = Math.atan(1 / Math.SQRT2);

/** The ground-plane angle between the camera and either horizontal axis. */
export const ISO_AZIMUTH_RAD = Math.PI / 4;

/** Extra clip distance, as a fraction of the bounds' depth, so the planes stay off the mesh. */
export const ORTHO_CLIP_PAD_RATIO = 0.08;

/** Margin around the fitted cut so the square does not touch the viewport edge. */
export const ISO_FIT_MARGIN = 1.08;

export type Vec3 = [number, number, number];

export type Aabb = {
  min: Vec3;
  max: Vec3;
};

const CORNER_SIGN: Record<IsoCorner, { east: number; south: number }> = {
  ne: { east: 1, south: -1 },
  nw: { east: -1, south: -1 },
  se: { east: 1, south: 1 },
  sw: { east: -1, south: 1 },
};

export function isIsoCorner(value: unknown): value is IsoCorner {
  return value === "ne" || value === "nw" || value === "se" || value === "sw";
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, factor: number): Vec3 {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const span = length(a);
  return scale(a, 1 / span);
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Unit offset from the frame centre to the camera.
 * The components are equal in magnitude, which is what makes the foreshortening equal.
 */
export function isoOffset(corner: IsoCorner): Vec3 {
  const sign = CORNER_SIGN[corner];
  return normalize([sign.east, 1, sign.south]);
}

/** Radians above the horizontal plane. Positive is above the ground. */
export function elevationRad(offset: Vec3): number {
  return Math.atan2(offset[1], Math.hypot(offset[0], offset[2]));
}

/**
 * Radians in the ground plane from the east axis (+X) toward south (+Z).
 * A true isometric corner lands on an odd multiple of 45°.
 */
export function azimuthFromEastRad(offset: Vec3): number {
  return Math.atan2(offset[2], offset[0]);
}

/** Smallest angle between the ground track and a horizontal axis. π/4 at a true corner. */
export function azimuthBetweenAxesRad(offset: Vec3): number {
  return Math.atan2(Math.abs(offset[2]), Math.abs(offset[0]));
}

/** Clockwise radians from north (−Z) to where the camera sits. */
export function bearingFromNorthRad(offset: Vec3): number {
  const east = offset[0];
  const north = -offset[2];
  const angle = Math.atan2(east, north);
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

export function frameCentre(bounds: Aabb): Vec3 {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

export function cornersOf(bounds: Aabb): Vec3[] {
  const { min, max } = bounds;
  const points: Vec3[] = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) points.push([x, y, z]);
    }
  }
  return points;
}

export function boundingRadius(bounds: Aabb): number {
  return 0.5 * length(sub(bounds.max, bounds.min));
}

/** Far enough along the isometric direction that the eye stays outside the bounds. */
export function eyeDistance(bounds: Aabb): number {
  return Math.max(boundingRadius(bounds) * 3, 1);
}

export function isoEye(centre: Vec3, corner: IsoCorner, distance: number): Vec3 {
  return add(centre, scale(isoOffset(corner), distance));
}

/**
 * Orthographic near and far, measured along the view (from the eye toward the target).
 * The planes bracket every corner of the bounds, with padding so a later zoom
 * (which does not move an orthographic camera along its view axis) cannot clip.
 * Near may be negative when the eye sits inside the box; OrthographicCamera allows that.
 */
export function orthoNearFar(bounds: Aabb, eye: Vec3, target: Vec3): { near: number; far: number } {
  const look = normalize(sub(target, eye));
  let near = Infinity;
  let far = -Infinity;
  for (const corner of cornersOf(bounds)) {
    const depth = dot(sub(corner, eye), look);
    if (depth < near) near = depth;
    if (depth > far) far = depth;
  }
  if (!Number.isFinite(near) || !Number.isFinite(far)) return { near: 0.1, far: 1000 };
  const span = Math.max(far - near, 1);
  const pad = Math.max(1, span * ORTHO_CLIP_PAD_RATIO);
  near -= pad;
  far += pad;
  if (!(far > near)) far = near + 1;
  return { near, far };
}

/** Camera right and up for a Y-up look-at. Matches three.js `Matrix4.lookAt`. */
export function cameraBasis(offsetFromCentre: Vec3): { right: Vec3; up: Vec3 } {
  const back = normalize(offsetFromCentre);
  const worldUp: Vec3 = [0, 1, 0];
  let right = cross(worldUp, back);
  if (length(right) < 1e-8) right = [1, 0, 0];
  right = normalize(right);
  const up = normalize(cross(back, right));
  return { right, up };
}

/** Width and height of the bounds on the view plane, in metres. */
export function projectedSize(bounds: Aabb, offsetFromCentre: Vec3): { width: number; height: number } {
  const { right, up } = cameraBasis(offsetFromCentre);
  const centre = frameCentre(bounds);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const corner of cornersOf(bounds)) {
    const rel = sub(corner, centre);
    const x = dot(rel, right);
    const y = dot(rel, up);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { width: Math.max(maxX - minX, 1e-6), height: Math.max(maxY - minY, 1e-6) };
}

/**
 * Orthographic zoom that fits the bounds in a pixel frustum of `viewWidth` × `viewHeight`.
 * three.js then shows `viewHeight / zoom` metres vertically.
 */
export function fitOrthoZoom(bounds: Aabb, offsetFromCentre: Vec3, viewWidth: number, viewHeight: number): number {
  const { width, height } = projectedSize(bounds, offsetFromCentre);
  const fitWidth = Math.max(viewWidth, 1) / (width * ISO_FIT_MARGIN);
  const fitHeight = Math.max(viewHeight, 1) / (height * ISO_FIT_MARGIN);
  return Math.min(fitWidth, fitHeight);
}
