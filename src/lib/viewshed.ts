import * as THREE from "three";
import { footprintBase } from "./terrain";
import { terrainMeshHeight } from "./terrainDrape";
import type { CityModel, Pt, Ring } from "../types";

/**
 * Ground viewshed on a 2.5D height grid (View tab).
 *
 * The grid holds the ground height of each cell, raised to the roof height where a building
 * footprint covers the cell. Buildings are solid blocks from the ground to the roof, trees are
 * ignored, and only ground cells (not walls or roofs) are scored. A cell is visible when the
 * straight line from the eye to a point 0.3 m above the cell's ground never passes below the
 * grid on the way.
 */

export const VIEWSHED_TARGET_LIFT_M = 0.3;
export const VIEWSHED_DEFAULT_EYE_M = 1.6;
export const VIEWSHED_DEFAULT_RADIUS_M = 200;
export const VIEWSHED_RADIUS_OPTIONS_M = [100, 200, 300, 500] as const;
export const VIEWSHED_SAMPLE_SPACING_M = 3;
export const VIEWSHED_CELL_M = 2;
/** Frame values. */
export const CELL_OUTSIDE = 0;
export const CELL_VISIBLE = 1;
export const CELL_BLOCKED = 2;

export type HeightGrid = {
  /** Columns (east) and rows (north). Row 0 is the southern edge. */
  cols: number;
  rows: number;
  x0: number;
  y0: number;
  cell: number;
  ground: Float32Array;
  surface: Float32Array;
  /** 1 where a building footprint covers the cell centre. */
  covered: Uint8Array;
};

export type GridBox = { x0: number; y0: number; x1: number; y1: number };

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Ground height at a local point: the draped terrain mesh, or 0 on a flat cut. */
export function groundHeightAt(model: Pick<CityModel, "terrain" | "sideM">, east: number, north: number): number {
  return model.terrain ? terrainMeshHeight(model.terrain, model.sideM, east, north) : 0;
}

export function buildHeightGrid(
  model: Pick<CityModel, "buildings" | "terrain" | "sideM">,
  box: GridBox,
  cell = VIEWSHED_CELL_M,
): HeightGrid {
  const cols = Math.max(1, Math.ceil((box.x1 - box.x0) / cell));
  const rows = Math.max(1, Math.ceil((box.y1 - box.y0) / cell));
  const ground = new Float32Array(cols * rows);
  const surface = new Float32Array(cols * rows);
  const covered = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const z = groundHeightAt(model, box.x0 + (c + 0.5) * cell, box.y0 + (r + 0.5) * cell);
      ground[r * cols + c] = z;
      surface[r * cols + c] = z;
    }
  }
  for (const building of model.buildings) {
    if (building.importedMassing) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of building.ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    if (maxX < box.x0 || minX > box.x1 || maxY < box.y0 || minY > box.y1) continue;
    const top = (model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0) + building.height;
    const c0 = Math.max(0, Math.floor((minX - box.x0) / cell));
    const c1 = Math.min(cols - 1, Math.floor((maxX - box.x0) / cell));
    const r0 = Math.max(0, Math.floor((minY - box.y0) / cell));
    const r1 = Math.min(rows - 1, Math.floor((maxY - box.y0) / cell));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = box.x0 + (c + 0.5) * cell;
        const y = box.y0 + (r + 0.5) * cell;
        if (!inRing(x, y, building.ring)) continue;
        if (building.holes.some((hole) => inRing(x, y, hole))) continue;
        const k = r * cols + c;
        covered[k] = 1;
        surface[k] = Math.max(surface[k]!, top);
      }
    }
  }
  return { cols, rows, x0: box.x0, y0: box.y0, cell, ground, surface, covered };
}

/**
 * One viewshed frame: CELL_VISIBLE / CELL_BLOCKED for every uncovered ground cell within `radius`
 * of the eye, CELL_OUTSIDE elsewhere. `eyeZ` is the absolute eye height (ground + eye height).
 */
export function viewshedFrame(grid: HeightGrid, eyeEast: number, eyeNorth: number, eyeZ: number, radius: number): Uint8Array {
  const { cols, rows, x0, y0, cell, ground, surface, covered } = grid;
  const out = new Uint8Array(cols * rows);
  const c0 = Math.max(0, Math.floor((eyeEast - radius - x0) / cell));
  const c1 = Math.min(cols - 1, Math.floor((eyeEast + radius - x0) / cell));
  const r0 = Math.max(0, Math.floor((eyeNorth - radius - y0) / cell));
  const r1 = Math.min(rows - 1, Math.floor((eyeNorth + radius - y0) / cell));
  const half = cell * 0.5;
  // A viewpoint inside a footprint (a path drawn through a building) looks out from the
  // building's edge: the samples still inside the footprint it starts in do not block.
  const ec = Math.floor((eyeEast - x0) / cell);
  const er = Math.floor((eyeNorth - y0) / cell);
  const eyeInside = ec >= 0 && er >= 0 && ec < cols && er < rows && covered[er * cols + ec] === 1;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const k = r * cols + c;
      if (covered[k]) continue;
      const dx = x0 + (c + 0.5) * cell - eyeEast;
      const dy = y0 + (r + 0.5) * cell - eyeNorth;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;
      const targetZ = ground[k]! + VIEWSHED_TARGET_LIFT_M;
      const steps = Math.ceil(dist / half);
      let blocked = false;
      let leaving = eyeInside;
      for (let s = 1; s < steps; s++) {
        const f = s / steps;
        if (f * dist < 1.5) continue;
        const sc = Math.floor((eyeEast + dx * f - x0) / cell);
        const sr = Math.floor((eyeNorth + dy * f - y0) / cell);
        if (sc < 0 || sr < 0 || sc >= cols || sr >= rows) continue;
        if (leaving) {
          if (covered[sr * cols + sc]) continue;
          leaving = false;
        }
        if (surface[sr * cols + sc]! > eyeZ + (targetZ - eyeZ) * f + 0.05) {
          blocked = true;
          break;
        }
      }
      out[k] = blocked ? CELL_BLOCKED : CELL_VISIBLE;
    }
  }
  return out;
}

/** Centripetal Catmull-Rom spline through the clicked points, resampled at even arc-length spacing. */
export function spacedSplineSamples(points: readonly Pt[], spacing = VIEWSHED_SAMPLE_SPACING_M): { samples: Pt[]; lengthM: number } {
  const clean: Pt[] = [];
  for (const p of points) {
    const last = clean[clean.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.01) clean.push([p[0], p[1]]);
  }
  if (clean.length < 2) return { samples: clean, lengthM: 0 };
  const curve = new THREE.CatmullRomCurve3(
    clean.map(([e, n]) => new THREE.Vector3(e, 0, n)),
    false,
    "centripetal",
  );
  curve.arcLengthDivisions = Math.max(200, clean.length * 50);
  const lengthM = curve.getLength();
  const divisions = Math.max(1, Math.round(lengthM / spacing));
  const samples = curve.getSpacedPoints(divisions).map((v) => [v.x, v.z] as Pt);
  return { samples, lengthM };
}

/** Analysis box: every sample plus the radius, clipped to the cut. */
export function walkGridBox(samples: readonly Pt[], radius: number, sideM: number): GridBox {
  const half = sideM / 2;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [e, n] of samples) {
    minX = Math.min(minX, e);
    maxX = Math.max(maxX, e);
    minY = Math.min(minY, n);
    maxY = Math.max(maxY, n);
  }
  return {
    x0: Math.max(-half, minX - radius),
    y0: Math.max(-half, minY - radius),
    x1: Math.min(half, maxX + radius),
    y1: Math.min(half, maxY + radius),
  };
}

/** Share of scored cells that are visible (0–100), and the count of scored cells. */
export function frameVisibleShare(frame: Uint8Array): { percent: number; scored: number } {
  let visible = 0;
  let scored = 0;
  for (let k = 0; k < frame.length; k++) {
    if (frame[k] === CELL_OUTSIDE) continue;
    scored++;
    if (frame[k] === CELL_VISIBLE) visible++;
  }
  return { percent: scored ? (100 * visible) / scored : 0, scored };
}
