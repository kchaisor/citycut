import type { InterleavedBufferAttribute } from "three";
import type { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { TerrainField } from "../types";
import { sampleTerrain } from "./terrain";
import { downwindFromSector } from "./windRose";

export const WIND_ARROW_COUNT = 6;
export const WIND_ARROW_LIFT_MIN_M = 20;
export const WIND_ARROW_LIFT_MAX_M = 30;
/** One full travel along the curve per loop. */
export const WIND_ARROW_LOOP_S = 3.5;

export type WindArrowCurve = {
  positions: Float32Array;
  pointCount: number;
  pathLenM: number;
  phase: number;
  headEast: number;
  headNorth: number;
  headY: number;
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
): WindArrowCurve {
  const positions = new Float32Array(segments * 3);
  const half = pathLen * 0.5;
  const startEast = centreEast - wx * half;
  const startNorth = centreNorth - wn * half;

  for (let s = 0; s < segments; s++) {
    const t = s / (segments - 1);
    const along = t * pathLen;
    const wave = waveAmp * Math.sin(t * Math.PI * waveCount);
    const east = startEast + wx * along + px * wave;
    const north = startNorth + wn * along + pz * wave;
    positions[s * 3] = east;
    positions[s * 3 + 1] = liftY;
    positions[s * 3 + 2] = -north;
  }

  const headIdx = (segments - 1) * 3;
  return {
    positions,
    pointCount: segments,
    pathLenM: pathLen,
    phase,
    headEast: positions[headIdx]!,
    headNorth: -positions[headIdx + 2]!,
    headY: positions[headIdx + 1]!,
  };
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

export function windArrowFlowDashOffset(timeS: number, phase: number, pathLenM: number): number {
  const loop = ((timeS + phase * WIND_ARROW_LOOP_S) % WIND_ARROW_LOOP_S) / WIND_ARROW_LOOP_S;
  return -loop * pathLenM;
}

export function updateWindArrowDashOffset(
  material: { dashOffset: number },
  timeS: number,
  phase: number,
  pathLenM: number,
): void {
  material.dashOffset = windArrowFlowDashOffset(timeS, phase, pathLenM);
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
