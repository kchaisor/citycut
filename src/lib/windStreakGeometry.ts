import type { InterleavedBufferAttribute } from "three";
import type { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { TerrainField } from "../types";
import { sampleTerrain } from "./terrain";
import { downwindFromSector } from "./windRose";

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

export const WIND_STREAK_COUNT = 2000;
export const WIND_STREAK_LENGTH_M = 18;
export const WIND_STREAK_LIFT_MIN_M = 3;
export const WIND_STREAK_LIFT_MAX_M = 15;

export type WindStreakBuffer = {
  /** Line segment pairs, metres in CityCut space (x east, y up, z = −north). */
  positions: Float32Array;
  /** Per streak, 0–1 phase for drift. */
  phases: Float32Array;
  /** Streak centre east / north for bounds checks. */
  centersEast: Float32Array;
  centersNorth: Float32Array;
  heights: Float32Array;
  sideM: number;
  terrainMin: number;
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

function wrapFrame(value: number, sideM: number): number {
  const half = sideM / 2;
  return ((((value + half) % sideM) + sideM) % sideM) - half;
}

/** Build streak centres inside the frame, 3–15 m above local terrain. */
export function buildWindStreakBuffer(
  sideM: number,
  prevailingSector: number,
  terrain: TerrainField | null | undefined,
): WindStreakBuffer {
  const sample = terrain
    ? (east: number, north: number) => sampleTerrain(terrain, east, north, sideM)
    : () => 0;
  const terrainMin = terrain?.min ?? 0;
  const wind = downwindFromSector(prevailingSector);
  const len = Math.hypot(wind.east, wind.north) || 1;
  const wx = wind.east / len;
  const wn = wind.north / len;
  const positions = new Float32Array(WIND_STREAK_COUNT * 2 * 3);
  const phases = new Float32Array(WIND_STREAK_COUNT);
  const centersEast = new Float32Array(WIND_STREAK_COUNT);
  const centersNorth = new Float32Array(WIND_STREAK_COUNT);
  const heights = new Float32Array(WIND_STREAK_COUNT);

  for (let i = 0; i < WIND_STREAK_COUNT; i++) {
    const seed = hash(i);
    const east = (seed.a - 0.5) * sideM * 0.96;
    const north = (seed.b - 0.5) * sideM * 0.96;
    const ground = sample(east, north);
    const lift =
      WIND_STREAK_LIFT_MIN_M +
      seed.c * (WIND_STREAK_LIFT_MAX_M - WIND_STREAK_LIFT_MIN_M);
    const y = ground + lift;
    centersEast[i] = east;
    centersNorth[i] = north;
    heights[i] = y;
    phases[i] = seed.d;

    const halfLen = WIND_STREAK_LENGTH_M * 0.5;
    const x0 = east - wx * halfLen;
    const z0 = -(north - wn * halfLen);
    const x1 = east + wx * halfLen;
    const z1 = -(north + wn * halfLen);
    const base = i * 6;
    positions[base] = x0;
    positions[base + 1] = y;
    positions[base + 2] = z0;
    positions[base + 3] = x1;
    positions[base + 4] = y;
    positions[base + 5] = z1;
  }

  return { positions, phases, centersEast, centersNorth, heights, sideM, terrainMin };
}

/** Drift streak centres downwind with wrap; updates line positions in place. */
export function updateWindStreakPositions(
  buffer: WindStreakBuffer,
  prevailingSector: number,
  timeS: number,
  speedMs: number,
): void {
  const { sideM, phases, centersEast, centersNorth, heights, positions } = buffer;
  const wind = downwindFromSector(prevailingSector);
  const len = Math.hypot(wind.east, wind.north) || 1;
  const wx = wind.east / len;
  const wn = wind.north / len;
  const halfLen = WIND_STREAK_LENGTH_M * 0.5;

  for (let i = 0; i < WIND_STREAK_COUNT; i++) {
    const drift = (phases[i]! + timeS * speedMs) % sideM;
    const east = wrapFrame(centersEast[i]! + wx * drift, sideM);
    const north = wrapFrame(centersNorth[i]! + wn * drift, sideM);
    const y = heights[i]!;
    const x0 = east - wx * halfLen;
    const z0 = -(north - wn * halfLen);
    const x1 = east + wx * halfLen;
    const z1 = -(north + wn * halfLen);
    const base = i * 6;
    positions[base] = x0;
    positions[base + 1] = y;
    positions[base + 2] = z0;
    positions[base + 3] = x1;
    positions[base + 4] = y;
    positions[base + 5] = z1;
  }
}

/** Copy streak positions into an existing wide-line geometry without reallocating GPU buffers. */
export function writeLineSegmentPositions(
  geometry: LineSegmentsGeometry,
  positions: Float32Array,
): void {
  const start = geometry.attributes.instanceStart as InterleavedBufferAttribute | undefined;
  const end = geometry.attributes.instanceEnd as InterleavedBufferAttribute | undefined;
  if (!start || !end) {
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

export type StreakBoundsReport = {
  insideFrame: boolean;
  aboveTerrain: boolean;
  minEast: number;
  maxEast: number;
  minNorth: number;
  maxNorth: number;
  minY: number;
};

/** Assert streak centres stay in the frame and above terrain (for tests/scripts). */
export function streakBoundsReport(buffer: WindStreakBuffer): StreakBoundsReport {
  const half = buffer.sideM / 2;
  let minEast = Infinity;
  let maxEast = -Infinity;
  let minNorth = Infinity;
  let maxNorth = -Infinity;
  let minY = Infinity;
  let insideFrame = true;
  let aboveTerrain = true;
  const floor = buffer.terrainMin + WIND_STREAK_LIFT_MIN_M - 0.5;

  for (let i = 0; i < WIND_STREAK_COUNT; i++) {
    const east = buffer.centersEast[i]!;
    const north = buffer.centersNorth[i]!;
    const y = buffer.heights[i]!;
    minEast = Math.min(minEast, east);
    maxEast = Math.max(maxEast, east);
    minNorth = Math.min(minNorth, north);
    maxNorth = Math.max(maxNorth, north);
    minY = Math.min(minY, y);
    if (Math.abs(east) > half + 0.01 || Math.abs(north) > half + 0.01) insideFrame = false;
    if (y < floor) aboveTerrain = false;
  }

  return { insideFrame, aboveTerrain, minEast, maxEast, minNorth, maxNorth, minY };
}
