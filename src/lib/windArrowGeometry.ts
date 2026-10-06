import type { InterleavedBufferAttribute } from "three";
import type { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { TerrainField } from "../types";
import { sampleTerrain } from "./terrain";
import { downwindFromSector } from "./windRose";

export const WIND_ARROW_COUNT = 6;
export const WIND_ARROW_LIFT_MIN_M = 20;
export const WIND_ARROW_LIFT_MAX_M = 30;
/** Opacity ramp over this fraction of the frame at upwind/downwind edges. */
export const WIND_ARROW_FADE_FRAC = 0.12;

/** Frame-relative drift speed (m/s): cross the site in ~25–40 s, scaled by median wind. */
export function windStreakSpeedMs(sideM: number, medianKmh: number): number {
  const calmKmh = 8;
  const strongKmh = 32;
  const t = Math.min(1, Math.max(0, (medianKmh - calmKmh) / (strongKmh - calmKmh)));
  const crossS = 40 - t * 15;
  const speed = sideM / crossS;
  const minSpeed = sideM / 55;
  const maxSpeed = sideM / 18;
  return Math.min(maxSpeed, Math.max(minSpeed, speed));
}

export type WindArrowCurve = {
  positions: Float32Array;
  pointCount: number;
  pathLenM: number;
  /** 0–1 stagger for drift phase. */
  phase: number;
  headEast: number;
  headNorth: number;
  headY: number;
  waveAmp: number;
  waveCount: number;
  liftY: number;
  /** Perpendicular offset from wind axis (m). */
  lateralM: number;
  /** Downwind axis position of curve centre (m). */
  alongM: number;
  /** Multiplier on drift speed (~0.85–1.15). */
  speedFactor: number;
  /** Arrow index for respawn hashing. */
  index: number;
  /** Current edge fade opacity 0–1 (animation only). */
  opacity: number;
  /** Internal respawn cycle tracker for lateral respawn. */
  _lastCycle: number;
};

export type WindArrowBuffer = {
  curves: WindArrowCurve[];
  sideM: number;
  terrainMin: number;
  allPositions: Float32Array;
};

export type ArrowHeadTriangle = {
  /** x,y,z triples: tip, left base, right base (ground-plane triangle). */
  positions: Float32Array;
};

function hash(i: number): { a: number; b: number; c: number; d: number } {
  const f = i * 127.1 - Math.floor(i * 127.1);
  return {
    a: fract(Math.sin(i * 12.9898) * 43758.5453),
    b: fract(Math.sin(i * 78.233) * 12345.6789),
    c: fract(f * 1.31),
    d: fract(f * 2.17),
  };
}

function fract(n: number): number {
  return n - Math.floor(n);
}

/** Even spread across the site (fractions of half-extent), with light jitter. */
const ARROW_SLOTS: [number, number][] = [
  [-0.38, -0.34],
  [0.02, -0.4],
  [0.4, -0.3],
  [-0.36, 0.32],
  [0.06, 0.38],
  [0.42, 0.28],
];

function minPolylineSeparation(a: Float32Array, b: Float32Array, step = 3): number {
  let min = Infinity;
  for (let i = 0; i < a.length; i += step * 3) {
    const ax = a[i]!;
    const ay = a[i + 1]!;
    const az = a[i + 2]!;
    for (let j = 0; j < b.length; j += step * 3) {
      const dx = ax - b[j]!;
      const dy = ay - b[j + 1]!;
      const dz = az - b[j + 2]!;
      min = Math.min(min, Math.hypot(dx, dy, dz));
    }
  }
  return min;
}

function lateralForRespawn(index: number, cycle: number, sideM: number): number {
  const seed = hash(index + cycle * 997 + 41);
  return (seed.a - 0.5) * sideM * 0.88;
}

/** Opacity ramp near upwind/downwind frame edges; fades before geometry leaves the square. */
export function windArrowEdgeOpacity(
  alongM: number,
  sideM: number,
  pathLenM: number,
  fadeFrac = WIND_ARROW_FADE_FRAC,
): number {
  const half = sideM / 2;
  const norm = (alongM + half) / sideM;
  let op = 1;
  if (norm < fadeFrac) op = norm / fadeFrac;
  else if (norm > 1 - fadeFrac) op = (1 - norm) / fadeFrac;
  const headAlong = alongM + pathLenM * 0.5;
  const tailAlong = alongM - pathLenM * 0.5;
  if (headAlong > half + 0.5) op = 0;
  if (tailAlong < -half - 0.5) op = 0;
  return Math.max(0, Math.min(1, op));
}

function fillCurvePositions(
  curve: WindArrowCurve,
  wx: number,
  wn: number,
  px: number,
  pz: number,
  wavePhase: number,
): void {
  const { positions, pointCount, pathLenM, liftY, waveAmp, waveCount, alongM, lateralM } = curve;
  const halfLen = pathLenM * 0.5;
  const centreEast = wx * alongM + px * lateralM;
  const centreNorth = wn * alongM + pz * lateralM;
  const startEast = centreEast - wx * halfLen;
  const startNorth = centreNorth - wn * halfLen;

  for (let s = 0; s < pointCount; s++) {
    const t = s / (pointCount - 1);
    const along = t * pathLenM;
    const wave = waveAmp * Math.sin(t * Math.PI * waveCount + wavePhase);
    positions[s * 3] = startEast + wx * along + px * wave;
    positions[s * 3 + 1] = liftY;
    positions[s * 3 + 2] = -(startNorth + wn * along + pz * wave);
  }

  const headIdx = (pointCount - 1) * 3;
  curve.headEast = positions[headIdx]!;
  curve.headNorth = -positions[headIdx + 2]!;
  curve.headY = positions[headIdx + 1]!;
}

function buildSingleCurve(
  wx: number,
  wn: number,
  px: number,
  pz: number,
  centreEast: number,
  centreNorth: number,
  pathLen: number,
  waveAmp: number,
  waveCount: number,
  liftY: number,
  segments: number,
  phase: number,
  index: number,
  speedFactor: number,
): WindArrowCurve {
  const alongM = centreEast * wx + centreNorth * wn;
  const lateralM = centreEast * px + centreNorth * pz;
  const positions = new Float32Array(segments * 3);
  const curve: WindArrowCurve = {
    positions,
    pointCount: segments,
    pathLenM: pathLen,
    phase,
    headEast: 0,
    headNorth: 0,
    headY: liftY,
    waveAmp,
    waveCount,
    liftY,
    lateralM,
    alongM,
    speedFactor,
    index,
    opacity: 1,
    _lastCycle: -1,
  };
  fillCurvePositions(curve, wx, wn, px, pz, phase * Math.PI * 2);
  return curve;
}

function sampleHeight(
  terrain: TerrainField | null | undefined,
  sideM: number,
  east: number,
  north: number,
): number {
  return terrain ? sampleTerrain(terrain, east, north, sideM) : 0;
}

/** Smooth downwind S-curves on a jittered grid; constant height per arrow. */
export function buildWindArrowBuffer(
  sideM: number,
  prevailingSector: number,
  terrain: TerrainField | null | undefined,
): WindArrowBuffer {
  const wind = downwindFromSector(prevailingSector);
  const wLen = Math.hypot(wind.east, wind.north) || 1;
  const wx = wind.east / wLen;
  const wn = wind.north / wLen;
  const px = -wn;
  const pz = wx;
  const half = sideM / 2;
  const curves: WindArrowCurve[] = [];
  const allChunks: number[] = [];
  const segments = 56;
  const minSep = sideM * 0.055;

  for (let i = 0; i < WIND_ARROW_COUNT; i++) {
    const seed = hash(i + prevailingSector * 31);
    const slot = ARROW_SLOTS[i] ?? [0, 0];
    const jitter = sideM * 0.045;
    let centreEast = slot[0] * half + (seed.a - 0.5) * jitter;
    let centreNorth = slot[1] * half + (seed.b - 0.5) * jitter;
    let pathLen = sideM * (0.32 + seed.c * 0.11);
    const waveCount = 1 + seed.d * 0.5;
    let waveAmp = pathLen * (0.08 + seed.a * 0.04);
    const groundMid = sampleHeight(terrain, sideM, centreEast, centreNorth);
    const liftY =
      groundMid + WIND_ARROW_LIFT_MIN_M + seed.b * (WIND_ARROW_LIFT_MAX_M - WIND_ARROW_LIFT_MIN_M);
    const speedFactor = 0.85 + seed.c * 0.3;

    const overlapsOthers = (curve: WindArrowCurve) =>
      curves.some((other) => minPolylineSeparation(curve.positions, other.positions) < minSep);

    let curve = buildSingleCurve(
      wx,
      wn,
      px,
      pz,
      centreEast,
      centreNorth,
      pathLen,
      waveAmp,
      waveCount,
      liftY,
      segments,
      seed.d,
      i,
      speedFactor,
    );

    let attempts = 0;
    while (overlapsOthers(curve) && attempts < 12) {
      if (attempts < 6) {
        const sign = attempts % 2 === 0 ? 1 : -1;
        const step = sideM * 0.04 * (1 + Math.floor(attempts / 2));
        centreEast += px * step * sign;
        centreNorth += pz * step * sign;
      } else if (attempts < 10) {
        waveAmp *= 0.88;
      } else {
        pathLen = Math.max(sideM * 0.3, pathLen * 0.97);
      }
      curve = buildSingleCurve(
        wx,
        wn,
        px,
        pz,
        centreEast,
        centreNorth,
        pathLen,
        waveAmp,
        waveCount,
        liftY,
        segments,
        seed.d,
        i,
        speedFactor,
      );
      attempts += 1;
    }

    curves.push(curve);
    for (let k = 0; k < curve.positions.length; k++) allChunks.push(curve.positions[k]!);
  }

  return {
    curves,
    sideM,
    terrainMin: terrain?.min ?? 0,
    allPositions: new Float32Array(allChunks),
  };
}

function syncAllPositions(buffer: WindArrowBuffer): void {
  let offset = 0;
  for (const curve of buffer.curves) {
    buffer.allPositions.set(curve.positions, offset);
    offset += curve.positions.length;
  }
}

/** Drift whole arrows downwind with edge fade, respawn upwind, and slow S-curve wiggle. */
export function updateWindArrowDrift(
  buffer: WindArrowBuffer,
  prevailingSector: number,
  timeS: number,
  speedMs: number,
): void {
  const wind = downwindFromSector(prevailingSector);
  const wLen = Math.hypot(wind.east, wind.north) || 1;
  const wx = wind.east / wLen;
  const wn = wind.north / wLen;
  const px = -wn;
  const pz = wx;
  const half = buffer.sideM / 2;

  for (const curve of buffer.curves) {
    const travelSpan = buffer.sideM + curve.pathLenM;
    const speed = speedMs * curve.speedFactor;
    const travelled = curve.phase * travelSpan + timeS * speed;
    const cycle = Math.floor(travelled / travelSpan);
    if (cycle !== curve._lastCycle) {
      curve._lastCycle = cycle;
      if (cycle > 0) {
        curve.lateralM = lateralForRespawn(curve.index, cycle, buffer.sideM);
      }
    }
    const progress = travelled - cycle * travelSpan;
    curve.alongM = -half - curve.pathLenM * 0.5 + progress;
    const wavePhase = curve.phase * Math.PI * 2 + timeS * 0.35;
    fillCurvePositions(curve, wx, wn, px, pz, wavePhase);
    let op = windArrowEdgeOpacity(curve.alongM, buffer.sideM, curve.pathLenM);
    if (op > 0) {
      const half = buffer.sideM / 2;
      for (let s = 0; s < curve.pointCount; s++) {
        const east = curve.positions[s * 3]!;
        const north = -curve.positions[s * 3 + 2]!;
        if (Math.abs(east) > half + 0.01 || Math.abs(north) > half + 0.01) {
          op = 0;
          break;
        }
      }
    }
    curve.opacity = op;
  }

  syncAllPositions(buffer);
}

/** Ground-plane filled arrowhead (tip + two base corners). */
export function arrowHeadTriangle(curve: WindArrowCurve): ArrowHeadTriangle {
  const n = curve.pointCount;
  const positions = curve.positions;
  const tipX = positions[(n - 1) * 3]!;
  const tipY = positions[(n - 1) * 3 + 1]!;
  const tipZ = positions[(n - 1) * 3 + 2]!;
  const prevX = positions[(n - 2) * 3]!;
  const prevZ = positions[(n - 2) * 3 + 2]!;
  let dx = tipX - prevX;
  let dz = tipZ - prevZ;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  const headLen = curve.pathLenM * (0.06 + 0.02 * fract(curve.phase * 17));
  const halfW = headLen * 0.55;
  const baseX = tipX - dx * headLen;
  const baseZ = tipZ - dz * headLen;
  const leftX = baseX - dz * halfW;
  const leftZ = baseZ + dx * halfW;
  const rightX = baseX + dz * halfW;
  const rightZ = baseZ - dx * halfW;
  return {
    positions: new Float32Array([
      tipX,
      tipY,
      tipZ,
      leftX,
      tipY,
      leftZ,
      rightX,
      tipY,
      rightZ,
    ]),
  };
}

/** @deprecated Plan/Rhino use {@link arrowHeadTriangle}; kept for stroke export helpers. */
export function arrowHeadSegmentPositions(curve: WindArrowCurve, _sideM: number): Float32Array {
  const tri = arrowHeadTriangle(curve);
  const p = tri.positions;
  return new Float32Array([
    p[3]!,
    p[4]!,
    p[5]!,
    p[0]!,
    p[1]!,
    p[2]!,
    p[6]!,
    p[7]!,
    p[8]!,
    p[0]!,
    p[1]!,
    p[2]!,
  ]);
}

export function writeLinePositions(geometry: LineGeometry | LineSegmentsGeometry, positions: Float32Array): void {
  const start = geometry.attributes.instanceStart as InterleavedBufferAttribute | undefined;
  if (!start) {
    geometry.setPositions(positions);
    return;
  }
  const buffer = start.data;
  const array = buffer.array as Float32Array;
  if (array.length !== positions.length) {
    geometry.setPositions(positions);
    return;
  }
  array.set(positions);
  buffer.needsUpdate = true;
  geometry.computeBoundingSphere();
}

export function writeHeadPositions(
  geometry: { getAttribute(name: "position"): { array: ArrayLike<number>; needsUpdate: boolean } },
  tri: ArrowHeadTriangle,
): void {
  const attr = geometry.getAttribute("position");
  const array = attr.array as Float32Array;
  array.set(tri.positions);
  attr.needsUpdate = true;
}

export type ArrowBoundsReport = {
  insideFrame: boolean;
  aboveTerrain: boolean;
  minY: number;
};

export function arrowBoundsReport(buffer: WindArrowBuffer): ArrowBoundsReport {
  const half = buffer.sideM / 2;
  let minY = Infinity;
  let insideFrame = true;
  const floor = buffer.terrainMin + WIND_ARROW_LIFT_MIN_M - 1;
  for (let i = 0; i < buffer.allPositions.length; i += 3) {
    const east = buffer.allPositions[i]!;
    const y = buffer.allPositions[i + 1]!;
    const north = -buffer.allPositions[i + 2]!;
    minY = Math.min(minY, y);
    if (Math.abs(east) > half + 0.01 || Math.abs(north) > half + 0.01) insideFrame = false;
  }
  return { insideFrame, aboveTerrain: minY >= floor, minY };
}

export type WindArrowHeadMetres = { east: number; north: number; y: number };

export function windArrowHeadPositionsMetres(buffer: WindArrowBuffer): WindArrowHeadMetres[] {
  return buffer.curves.map((c) => ({ east: c.headEast, north: c.headNorth, y: c.headY }));
}

/** Plan/Rhino export: east/north path plus filled head triangle. */
export function windFlowArrowPolylines(
  sideM: number,
  prevailingSector: number,
): { path: [number, number][]; head: [number, number][] }[] {
  const buffer = buildWindArrowBuffer(sideM, prevailingSector, null);
  const out: { path: [number, number][]; head: [number, number][] }[] = [];
  for (const curve of buffer.curves) {
    const path: [number, number][] = [];
    for (let i = 0; i < curve.pointCount; i++) {
      path.push([curve.positions[i * 3]!, -curve.positions[i * 3 + 2]!]);
    }
    const tri = arrowHeadTriangle(curve);
    const head: [number, number][] = [
      [tri.positions[0]!, -tri.positions[2]!],
      [tri.positions[3]!, -tri.positions[5]!],
      [tri.positions[6]!, -tri.positions[8]!],
    ];
    out.push({ path, head });
  }
  return out;
}
