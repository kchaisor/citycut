import * as THREE from "three";
import { dashSegments, readDrawingStyle } from "./drawingStyle";
import type { Pt } from "../types";

/** At 1:1000 on the plan, 1 mm on the sheet equals 1 m on the ground. */
export function siteBoundaryDashMetres(sideM: number, scaleDenominator = 1000): number[] {
  const dash = readDrawingStyle().siteBoundary.dash;
  const segments = dashSegments(dash);
  if (!segments) return [];
  const metresPerMm = sideM / (sideM * (1000 / scaleDenominator));
  return segments.map((mm) => mm * metresPerMm);
}

/** Expand polylines into dashed segments in ground metres (x east, z = −north, y up). */
export function dashedSiteBoundaryPositions(
  lines: Pt[][],
  sampleZ: (east: number, north: number) => number,
  patternMetres: number[],
  lift = 0.05,
): number[] {
  if (patternMetres.length < 2) return solidSiteBoundaryPositions(lines, sampleZ, lift);
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

function solidSiteBoundaryPositions(
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

export function siteBoundaryLineGeometry(
  lines: Pt[][],
  sideM: number,
  sampleZ: (east: number, north: number) => number,
): THREE.BufferGeometry | null {
  const pattern = siteBoundaryDashMetres(sideM);
  const positions =
    pattern.length >= 2
      ? dashedSiteBoundaryPositions(lines, sampleZ, pattern)
      : solidSiteBoundaryPositions(lines, sampleZ, 0.05);
  if (positions.length < 6) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}
