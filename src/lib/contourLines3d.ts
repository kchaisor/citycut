import * as THREE from "three";
import { getColour } from "./colours";
import { readDrawingStyle } from "./drawingStyle";
import { planPaths } from "./svgPlan";
import { SURFACE } from "./surfaceLayers";
import { sampleTerrain } from "./terrain";
import type { CityModel, Pt } from "../types";

const CONTOUR_LIFT = 0.35;
export const CONTOUR_3D_DASH_M = 6;
export const CONTOUR_3D_GAP_M = 3;

export function contourPolylinesForModel(model: CityModel, planScale = 1000): Pt[][] {
  const style = readDrawingStyle();
  const plan = planPaths(
    model,
    style.pathWidthM,
    style.contourIndexEvery,
    planScale,
    style.contourCoarseIntervalM,
    style.contourCoarseFromScale,
  );
  return plan.contours;
}

export function drapeContourSegmentsWithDistances(
  lines: Pt[][],
  sample: (east: number, north: number) => number,
  maxStepM: number,
  lift: number,
): { positions: number[]; lineDistances: number[] } {
  const positions: number[] = [];
  const lineDistances: number[] = [];
  const step = maxStepM > 0 ? maxStepM : Infinity;
  for (const line of lines) {
    let dist = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const pieces = Math.max(1, Math.min(64, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)));
      let pe = a[0];
      let pn = a[1];
      let py = sample(pe, pn) + lift;
      for (let k = 1; k <= pieces; k++) {
        const t = k / pieces;
        const qe = a[0] + (b[0] - a[0]) * t;
        const qn = a[1] + (b[1] - a[1]) * t;
        const qy = sample(qe, qn) + lift;
        const segLen = Math.hypot(qe - pe, qy - py, qn - pn);
        positions.push(pe, py, -pn, qe, qy, -qn);
        lineDistances.push(dist, dist + segLen);
        dist += segLen;
        pe = qe;
        pn = qn;
        py = qy;
      }
    }
  }
  return { positions, lineDistances };
}

export function drapeContourSegments(
  lines: Pt[][],
  sample: (east: number, north: number) => number,
  maxStepM: number,
  lift: number,
): number[] {
  return drapeContourSegmentsWithDistances(lines, sample, maxStepM, lift).positions;
}

export function contourDrapeStepM(model: CityModel): number {
  return model.terrain ? model.terrain.spacingM / 2 : Infinity;
}

export function buildContourLineGeometry(
  model: CityModel,
  planScale = 1000,
): THREE.BufferGeometry | null {
  const lines = contourPolylinesForModel(model, planScale);
  if (lines.length === 0) return null;
  const sample =
    model.terrain != null
      ? (east: number, north: number) => sampleTerrain(model.terrain!, east, north, model.sideM)
      : () => 0;
  const { positions, lineDistances } = drapeContourSegmentsWithDistances(
    lines,
    sample,
    contourDrapeStepM(model),
    CONTOUR_LIFT + SURFACE.building.lift,
  );
  if (positions.length < 6) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("lineDistance", new THREE.Float32BufferAttribute(lineDistances, 1));
  return geometry;
}

export function buildContourLineObject(model: CityModel, planScale = 1000): THREE.LineSegments | null {
  const geometry = buildContourLineGeometry(model, planScale);
  if (!geometry) return null;
  const material = new THREE.LineDashedMaterial({
    color: getColour("--outline-contour"),
    dashSize: CONTOUR_3D_DASH_M,
    gapSize: CONTOUR_3D_GAP_M,
    scale: 1,
    toneMapped: false,
    depthTest: true,
  });
  material.name = "Contours3d";
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = "Contours3d";
  lines.renderOrder = SURFACE.building.renderOrder + 2;
  return lines;
}
