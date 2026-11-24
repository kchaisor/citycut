import * as THREE from "three";
import type { Pt } from "../types";
import { arrowLabelAnchor, type ArrowShape, type DiagramArrow } from "./diagramArrows";
import { CITYCUT_EXPORT_ONLY } from "./screenOnly";
import { sampleTerrain } from "./terrain";
import type { CityModel } from "../types";

export const ARROW_LIFT_EPSILON_M = 0.05;

export type GroundAt = (east: number, north: number) => number;

export function groundAtFor(model: Pick<CityModel, "terrain" | "sideM">): GroundAt {
  const field = model.terrain;
  return field ? (east, north) => sampleTerrain(field, east, north, model.sideM) : () => 0;
}

export function arrowShapeGeometry(shape: ArrowShape, groundAt: GroundAt, heightM: number, liftM = 0): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const vertex = (point: Pt) => positions.push(point[0], groundAt(point[0], point[1]) + heightM + ARROW_LIFT_EPSILON_M + liftM, -point[1]);
  for (const ribbon of shape.ribbons) {
    for (let i = 1; i < ribbon.left.length; i += 1) {
      const a = ribbon.left[i - 1]!;
      const b = ribbon.left[i]!;
      const c = ribbon.right[i - 1]!;
      const d = ribbon.right[i]!;
      for (const point of [a, c, b, b, c, d]) vertex(point);
    }
  }
  for (const head of shape.heads) for (const point of head) vertex(point);
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export function arrowWorldPoint(point: Pt, groundAt: GroundAt, heightM: number): THREE.Vector3 {
  return new THREE.Vector3(point[0], groundAt(point[0], point[1]) + heightM + ARROW_LIFT_EPSILON_M, -point[1]);
}

export function intersectArrowPlane(ray: THREE.Ray, groundAt: GroundAt, heightM: number): Pt | null {
  let y = groundAt(0, 0) + heightM;
  const hit = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let found: Pt | null = null;
  for (let pass = 0; pass < 3; pass += 1) {
    plane.constant = -y;
    if (!ray.intersectPlane(plane, hit)) return null;
    found = [hit.x, -hit.z];
    y = groundAt(found[0], found[1]) + heightM;
  }
  return found;
}

export const ARROW_EDITOR = "citycutArrowEditor";

export function markArrowEditor(object: THREE.Object3D): void {
  object.userData[ARROW_EDITOR] = true;
}

export function withArrowEditorHidden<T>(root: THREE.Object3D, work: () => T): T {
  const hidden: THREE.Object3D[] = [];
  const revealed: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object.userData[CITYCUT_EXPORT_ONLY] && !object.visible) {
      object.visible = true;
      revealed.push(object);
    }
    if (object.userData[ARROW_EDITOR] && object.visible) {
      object.visible = false;
      hidden.push(object);
    }
  });
  try {
    return work();
  } finally {
    for (const object of hidden) object.visible = true;
    for (const object of revealed) object.visible = false;
  }
}

export type ArrowScreenLabel = { id: string; text: string; x: number; y: number };

export const ARROW_LABEL_LIFT_PX = 16;

export function projectGroundPoint(camera: THREE.Camera, world: THREE.Vector3, rect: { width: number; height: number }): Pt | null {
  const ndc = world.clone().project(camera);
  if (ndc.z < -1 || ndc.z > 1) return null;
  return [(ndc.x * 0.5 + 0.5) * rect.width, (-ndc.y * 0.5 + 0.5) * rect.height];
}

export function projectArrowLabels(
  camera: THREE.Camera,
  arrows: readonly Pick<DiagramArrow, "id" | "label" | "points" | "heightM">[],
  groundAt: GroundAt,
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0,
): ArrowScreenLabel[] {
  camera.updateMatrixWorld();
  const out: ArrowScreenLabel[] = [];
  for (const arrow of arrows) {
    if (arrow.label.trim() === "") continue;
    const at = projectGroundPoint(camera, arrowWorldPoint(arrowLabelAnchor(arrow.points), groundAt, arrow.heightM), { width, height });
    if (!at || at[0] < 0 || at[0] > width || at[1] < 0 || at[1] > height) continue;
    out.push({ id: arrow.id, text: arrow.label.trim(), x: offsetX + at[0], y: offsetY + at[1] - ARROW_LABEL_LIFT_PX });
  }
  return out;
}
