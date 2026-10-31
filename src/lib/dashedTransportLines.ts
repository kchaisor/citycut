import * as THREE from "three";
import { dashSegments, type StrokeStyle } from "./drawingStyle";
import { clipPolylineSiteFrame, DEFAULT_SITE_FRAME_SHAPE } from "./siteFrame";
import type { CityModel, Pt } from "../types";

export function strokeDashMetres(stroke: StrokeStyle, sideM: number, scaleDenominator = 1000): number[] {
  const segments = dashSegments(stroke.dash);
  if (!segments || segments.length < 2) return [];
  const metresPerMm = sideM / (sideM * (1000 / scaleDenominator));
  return segments.map((mm) => mm * metresPerMm);
}

function expandDashedSegments(
  lines: Pt[][],
  sampleZ: (east: number, north: number) => number,
  patternMetres: number[],
  lift: number,
): number[] {
  if (patternMetres.length < 2) return solidSegments(lines, sampleZ, lift);
  const positions: number[] = [];
  let patternIndex = 0;
  let remaining = patternMetres[patternIndex] ?? 0;
  let drawing = true;

  const step = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return;
    let travelled = 0;
    while (travelled < len - 1e-6) {
      const stepLen = Math.min(remaining, len - travelled);
      const t0 = travelled / len;
      const t1 = (travelled + stepLen) / len;
      const sx = ax + dx * t0;
      const sy = ay + dy * t0;
      const sz = az + dz * t0;
      const ex = ax + dx * t1;
      const ey = ay + dy * t1;
      const ez = az + dz * t1;
      if (drawing) positions.push(sx, sy, sz, ex, ey, ez);
      travelled += stepLen;
      remaining -= stepLen;
      if (remaining <= 1e-6) {
        patternIndex = (patternIndex + 1) % patternMetres.length;
        remaining = patternMetres[patternIndex] ?? 0;
        drawing = patternIndex % 2 === 0;
      }
    }
  };

  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const ya = sampleZ(a[0], a[1]) + lift;
      const yb = sampleZ(b[0], b[1]) + lift;
      step(a[0], ya, -a[1], b[0], yb, -b[1]);
    }
  }
  return positions;
}

function solidSegments(
  lines: Pt[][],
  sampleZ: (east: number, north: number) => number,
  lift: number,
): number[] {
  const positions: number[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const ya = sampleZ(a[0], a[1]) + lift;
      const yb = sampleZ(b[0], b[1]) + lift;
      positions.push(a[0], ya, -a[1], b[0], yb, -b[1]);
    }
  }
  return positions;
}

export function clipTransportLines(model: CityModel): { rails: Pt[][]; trams: Pt[][] } {
  const shape = model.frameShape ?? DEFAULT_SITE_FRAME_SHAPE;
  const rails: Pt[][] = [];
  for (const road of model.roads) {
    if (road.kind !== "rail") continue;
    for (const part of clipPolylineSiteFrame(road.line, model.sideM, shape)) rails.push(part);
  }
  const trams: Pt[][] = [];
  for (const line of model.tramLines ?? []) {
    for (const part of clipPolylineSiteFrame(line, model.sideM, shape)) trams.push(part);
  }
  return { rails, trams };
}

export function drapedDashedLineGeometry(
  lines: Pt[][],
  stroke: StrokeStyle,
  sideM: number,
  sampleZ: (east: number, north: number) => number,
  lift: number,
): THREE.BufferGeometry | null {
  if (lines.length === 0) return null;
  const pattern = strokeDashMetres(stroke, sideM);
  const positions = expandDashedSegments(lines, sampleZ, pattern, lift);
  if (positions.length < 6) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}
