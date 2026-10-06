import type { InterleavedBufferAttribute } from "three";
import type { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import type { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { TerrainField } from "../types";
import { sampleTerrain } from "./terrain";
import { downwindFromSector } from "./windRose";

export const WIND_ARROW_COUNT = 6;
export const WIND_ARROW_LIFT_MIN_M = 18;
export const WIND_ARROW_LIFT_MAX_M = 25;
export const WIND_ARROW_LOOP_S = 4.5;

export type WindArrowCurve = {
  /** x,y,z triples along the wavy path (CityCut space). */
  positions: Float32Array;
  pointCount: number;
  phase: number;
  headEast: number;
  headNorth: number;
  headY: number;
};

export type WindArrowBuffer = {
  curves: WindArrowCurve[];
  sideM: number;
  terrainMin: number;
  /** Flat array of all curve vertices for bounds checks. */
  allPositions: Float32Array;
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

function sampleHeight(
  terrain: TerrainField | null | undefined,
  sideM: number,
  east: number,
  north: number,
): number {
  const ground = terrain ? sampleTerrain(terrain, east, north, sideM) : 0;
  return ground;
}

/** Wavy downwind path spanning a few hundred metres, spread across the frame. */
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
  const curves: WindArrowCurve[] = [];
  const allChunks: number[] = [];

  for (let i = 0; i < WIND_ARROW_COUNT; i++) {
    const seed = hash(i + prevailingSector * 17);
    const centreEast = (seed.a - 0.5) * sideM * 0.68;
    const centreNorth = (seed.b - 0.5) * sideM * 0.68;
    const pathLen = sideM * (0.28 + seed.c * 0.18);
    const waveAmp = sideM * (0.022 + seed.d * 0.015);
    const waveLen = sideM * (0.12 + seed.a * 0.08);
    const segments = 48;
    const positions = new Float32Array(segments * 3);
    const lift =
      WIND_ARROW_LIFT_MIN_M + seed.c * (WIND_ARROW_LIFT_MAX_M - WIND_ARROW_LIFT_MIN_M);

    for (let s = 0; s < segments; s++) {
      const t = s / (segments - 1);
      const along = (t - 0.5) * pathLen;
      const wave = Math.sin((t * Math.PI * 2 * pathLen) / waveLen + seed.d * 6) * waveAmp;
      const east = centreEast + wx * along + px * wave;
      const north = centreNorth + wn * along + pz * wave;
      const y = sampleHeight(terrain, sideM, east, north) + lift;
      positions[s * 3] = east;
      positions[s * 3 + 1] = y;
      positions[s * 3 + 2] = -north;
      allChunks.push(east, y, -north);
    }

    const headIdx = (segments - 1) * 3;
    curves.push({
      positions,
      pointCount: segments,
      phase: seed.d,
      headEast: positions[headIdx]!,
      headNorth: -positions[headIdx + 2]!,
      headY: positions[headIdx + 1]!,
    });
  }

  return {
    curves,
    sideM,
    terrainMin: terrain?.min ?? 0,
    allPositions: new Float32Array(allChunks),
  };
}

/** Append an arrowhead triangle at the path end (two extra segments). */
export function arrowHeadSegmentPositions(curve: WindArrowCurve, sideM: number): Float32Array {
  const n = curve.pointCount;
  const positions = curve.positions;
  const tipX = positions[(n - 1) * 3]!;
  const tipY = positions[(n - 1) * 3 + 1]!;
  const tipZ = positions[(n - 1) * 3 + 2]!;
  const prevX = positions[(n - 2) * 3]!;
  const prevY = positions[(n - 2) * 3 + 1]!;
  const prevZ = positions[(n - 2) * 3 + 2]!;
  let dx = tipX - prevX;
  let dy = tipY - prevY;
  let dz = tipZ - prevZ;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len;
  dy /= len;
  dz /= len;
  const headLen = sideM * 0.045;
  const wing = sideM * 0.022;
  const leftX = tipX - dx * headLen - dz * wing;
  const leftY = tipY - dy * headLen;
  const leftZ = tipZ - dz * headLen + dx * wing;
  const rightX = tipX - dx * headLen + dz * wing;
  const rightY = tipY - dy * headLen;
  const rightZ = tipZ - dz * headLen - dx * wing;
  return new Float32Array([
    leftX,
    leftY,
    leftZ,
    tipX,
    tipY,
    tipZ,
    rightX,
    rightY,
    rightZ,
    tipX,
    tipY,
    tipZ,
  ]);
}

export function updateWindArrowDashOffset(material: { dashOffset: number }, timeS: number, phase: number): void {
  const loop = ((timeS + phase * WIND_ARROW_LOOP_S) % WIND_ARROW_LOOP_S) / WIND_ARROW_LOOP_S;
  material.dashOffset = -loop * 12;
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

/** Plan/Rhino export: local east/north polylines with arrow heads. */
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
    const headSeg = arrowHeadSegmentPositions(curve, sideM);
    const head: [number, number][] = [
      [headSeg[0]!, -headSeg[2]!],
      [headSeg[3]!, -headSeg[5]!],
      [headSeg[6]!, -headSeg[8]!],
    ];
    out.push({ path, head });
  }
  return out;
}
