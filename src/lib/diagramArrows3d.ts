import * as THREE from "three";
import type { Pt } from "../types";
import type { DiagramArrow } from "./diagramArrows";
import type { ArrowShape } from "./diagramArrowsShape";
import { arrowElevationProfile, arrowMidpoint, distanceToPath } from "./diagramArrowsPath";
import { CITYCUT_EXPORT_ONLY } from "./screenOnly";
import { screenConstantHitRadiusM } from "./sectionKnife/gizmoHit";
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
  const colours: number[] = [];
  const vertex = (point: Pt, alpha = 1) => {
    positions.push(point[0], groundAt(point[0], point[1]) + heightM + ARROW_LIFT_EPSILON_M + liftM, -point[1]);
    colours.push(1, 1, 1, alpha);
  };
  for (const ribbon of shape.ribbons) {
    for (let i = 1; i < ribbon.left.length; i += 1) {
      const before = ribbon.alpha?.[i - 1] ?? 1;
      const after = ribbon.alpha?.[i] ?? 1;
      const a = ribbon.left[i - 1]!;
      const b = ribbon.left[i]!;
      const c = ribbon.right[i - 1]!;
      const d = ribbon.right[i]!;
      vertex(a, before);
      vertex(c, before);
      vertex(b, after);
      vertex(b, after);
      vertex(c, before);
      vertex(d, after);
    }
  }
  for (const head of shape.heads) for (const point of head) vertex(point);
  for (const polygon of shape.polygons) {
    for (let i = 1; i < polygon.length - 1; i += 1) for (const point of [polygon[0]!, polygon[i]!, polygon[i + 1]!]) vertex(point);
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colours, 4));
  geometry.userData.faded = colours.some((value, index) => index % 4 === 3 && value < 1);
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

export function projectGroundPoint(camera: THREE.Camera, world: THREE.Vector3, rect: { width: number; height: number }): Pt | null {
  const ndc = world.clone().project(camera);
  if (ndc.z < -1 || ndc.z > 1) return null;
  return [(ndc.x * 0.5 + 0.5) * rect.width, (-ndc.y * 0.5 + 0.5) * rect.height];
}

export function arrowBaseAt(arrow: Pick<DiagramArrow, "points" | "pointHeights">, groundAt: GroundAt): GroundAt {
  const heights = arrow.pointHeights;
  return heights && heights.length === arrow.points.length ? arrowElevationProfile(arrow.points, heights) : groundAt;
}

export function arrowNodeBases(arrow: Pick<DiagramArrow, "points" | "pointHeights">, groundAt: GroundAt): number[] {
  const heights = arrow.pointHeights;
  return heights && heights.length === arrow.points.length ? [...heights] : arrow.points.map((point) => groundAt(point[0], point[1]));
}

export type GumballAxis = "x" | "y" | "z";

export const GUMBALL_AXES: readonly GumballAxis[] = ["x", "y", "z"];

export const GUMBALL_DIRECTIONS: Record<GumballAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 0, -1),
  z: new THREE.Vector3(0, 1, 0),
};

export const ARROW_GUMBALL = "citycutArrowGumball";

export type GumballColours = { origin: string; x: string; y: string; z: string };

const GUMBALL_SHAFT_RADIUS = 0.014;
const GUMBALL_TIP_RADIUS = 0.055;
const GUMBALL_TIP_LENGTH = 0.2;
const GUMBALL_ORIGIN_RADIUS = 0.06;
const GUMBALL_SPAN_FRAC = 1.1;

export function arrowGumball(at: THREE.Vector3, colours: GumballColours, axes: readonly GumballAxis[] = GUMBALL_AXES): THREE.Group {
  const group = new THREE.Group();
  group.name = "ArrowGumball";
  group.userData[ARROW_GUMBALL] = true;
  group.position.copy(at);
  const part = (geometry: THREE.BufferGeometry, colour: string): THREE.Mesh => {
    const material = new THREE.MeshBasicMaterial({ color: colour, depthTest: false, toneMapped: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 61;
    mesh.userData.noScenePick = true;
    group.add(mesh);
    return mesh;
  };
  part(new THREE.SphereGeometry(GUMBALL_ORIGIN_RADIUS, 12, 8), colours.origin).name = "origin";
  for (const axis of axes) {
    const direction = GUMBALL_DIRECTIONS[axis];
    const orient = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    const shaftLength = 1 - GUMBALL_TIP_LENGTH;
    const shaft = part(new THREE.CylinderGeometry(GUMBALL_SHAFT_RADIUS, GUMBALL_SHAFT_RADIUS, shaftLength, 6), colours[axis]);
    shaft.quaternion.copy(orient);
    shaft.position.copy(direction).multiplyScalar(shaftLength / 2);
    shaft.name = `${axis}-shaft`;
    const tip = part(new THREE.ConeGeometry(GUMBALL_TIP_RADIUS, GUMBALL_TIP_LENGTH, 12), colours[axis]);
    tip.quaternion.copy(orient);
    tip.position.copy(direction).multiplyScalar(1 - GUMBALL_TIP_LENGTH / 2);
    tip.name = `${axis}-tip`;
  }
  return group;
}

export function gumballLengthM(camera: THREE.Camera, at: THREE.Vector3, canvasHeightPx: number, pixelLength: number): number {
  camera.updateMatrixWorld();
  return screenConstantHitRadiusM(camera, at, pixelLength, canvasHeightPx);
}

export function disposeGumball(group: THREE.Group): void {
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    materials.add(mesh.material as THREE.Material);
  });
  for (const material of materials) material.dispose();
}

export function arrowGumballOrigin(arrow: DiagramArrow, selectedPoint: number | null, groundAt: GroundAt): THREE.Vector3 {
  const base = arrowBaseAt(arrow, groundAt);
  if (selectedPoint !== null && arrow.points[selectedPoint]) {
    const point = arrow.points[selectedPoint]!;
    return new THREE.Vector3(point[0], (arrow.pointHeights?.[selectedPoint] ?? groundAt(point[0], point[1])) + arrow.heightM + ARROW_LIFT_EPSILON_M, -point[1]);
  }
  return arrowWorldPoint(arrowMidpoint(arrow.points), base, arrow.heightM);
}

export function gumballAxisHit(
  camera: THREE.Camera,
  at: THREE.Vector3,
  lengthM: number,
  local: Pt,
  rect: { width: number; height: number },
  tolerancePx: number,
  axes: readonly GumballAxis[] = GUMBALL_AXES,
  deadZonePx = 7,
): GumballAxis | null {
  camera.updateMatrixWorld();
  const start = projectGroundPoint(camera, at, rect);
  if (!start) return null;
  let best: GumballAxis | null = null;
  let bestDist = tolerancePx;
  for (const axis of axes) {
    const end = projectGroundPoint(camera, at.clone().addScaledVector(GUMBALL_DIRECTIONS[axis], lengthM * GUMBALL_SPAN_FRAC), rect);
    if (!end) continue;
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const along = ((local[0] - start[0]) * dx + (local[1] - start[1]) * dy) / len;
    if (along < deadZonePx) continue;
    const d = distanceToPath([start, end], local);
    if (d <= bestDist) {
      bestDist = d;
      best = axis;
    }
  }
  return best;
}

export function gumballAxisPlane(at: THREE.Vector3, axis: GumballAxis, camera: THREE.Camera): THREE.Plane | null {
  const direction = GUMBALL_DIRECTIONS[axis];
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const normal = forward.addScaledVector(direction, -forward.dot(direction));
  if (normal.lengthSq() < 1e-6) return null;
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal.normalize(), at);
}

export function gumballPlaneHit(ray: THREE.Ray, plane: THREE.Plane): THREE.Vector3 | null {
  return ray.intersectPlane(plane, new THREE.Vector3());
}

export function gumballAxisDelta(hit: THREE.Vector3, startHit: THREE.Vector3, axis: GumballAxis): number {
  return hit.clone().sub(startHit).dot(GUMBALL_DIRECTIONS[axis]);
}
