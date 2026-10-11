import * as THREE from "three";
import { getColour } from "./colours";
import { readDrawingStyle } from "./drawingStyle";
import { planPaths } from "./svgPlan";
import { SURFACE } from "./surfaceLayers";
import { sampleTerrain } from "./terrain";
import type { CityModel, Pt } from "../types";

const CONTOUR_LIFT = 0.35;

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
  const positions: number[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const ya = sample(a[0], a[1]) + CONTOUR_LIFT + SURFACE.building.lift;
      const yb = sample(b[0], b[1]) + CONTOUR_LIFT + SURFACE.building.lift;
      positions.push(a[0], ya, -a[1], b[0], yb, -b[1]);
    }
  }
  if (positions.length < 6) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export function buildContourLineObject(model: CityModel, planScale = 1000): THREE.LineSegments | null {
  const geometry = buildContourLineGeometry(model, planScale);
  if (!geometry) return null;
  const material = new THREE.LineBasicMaterial({
    color: getColour("--outline-contour"),
    toneMapped: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.name = "Contours3d";
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = "Contours3d";
  lines.renderOrder = SURFACE.building.renderOrder + 2;
  return lines;
}
