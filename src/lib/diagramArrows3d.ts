import * as THREE from "three";
import type { Pt } from "../types";
import type { ArrowShape } from "./diagramArrowsShape";
import { distanceToPath } from "./diagramArrowsPath";
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

export const ARROW_GUMBALL = "citycutArrowGumball";

const GUMBALL_STEM_FRAC = 0.14;
const GUMBALL_CONE_FRAC = 0.6;

export function arrowGumball(at: THREE.Vector3, groundY: number, radius: number, colour: string): THREE.Group {
  const group = new THREE.Group();
  group.name = "ArrowGumball";
  group.userData[ARROW_GUMBALL] = true;
  group.position.copy(at);
  const material = new THREE.MeshBasicMaterial({ color: colour, depthTest: false, toneMapped: false });
  const part = (geometry: THREE.BufferGeometry): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 61;
    mesh.userData.noScenePick = true;
    group.add(mesh);
    return mesh;
  };
  const stemLength = at.y - groundY;
  if (stemLength > radius * 0.1) {
    const stem = part(new THREE.CylinderGeometry(radius * GUMBALL_STEM_FRAC, radius * GUMBALL_STEM_FRAC, stemLength, 8));
    stem.position.y = -stemLength / 2;
  }
  const ring = part(new THREE.TorusGeometry(radius, radius * GUMBALL_STEM_FRAC * 1.4, 8, 28));
  ring.rotation.x = Math.PI / 2;
  const coneHeight = radius * GUMBALL_CONE_FRAC * 2;
  const up = part(new THREE.ConeGeometry(radius * GUMBALL_CONE_FRAC, coneHeight, 14));
  up.position.y = radius * 1.4 + coneHeight / 2;
  const down = part(new THREE.ConeGeometry(radius * GUMBALL_CONE_FRAC, coneHeight, 14));
  down.rotation.x = Math.PI;
  down.position.y = -(radius * 1.4 + coneHeight / 2);
  return group;
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

export function gumballPlane(at: THREE.Vector3, camera: THREE.Camera): THREE.Plane | null {
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const horizontal = new THREE.Vector3(forward.x, 0, forward.z);
  if (horizontal.lengthSq() < 1e-6) return null;
  return new THREE.Plane().setFromNormalAndCoplanarPoint(horizontal.normalize(), at);
}

export function gumballWorldY(ray: THREE.Ray, plane: THREE.Plane): number | null {
  const hit = ray.intersectPlane(plane, new THREE.Vector3());
  return hit ? hit.y : null;
}

export function gumballHit(
  camera: THREE.Camera,
  at: THREE.Vector3,
  radius: number,
  local: Pt,
  rect: { width: number; height: number },
  tolerancePx: number,
): boolean {
  camera.updateMatrixWorld();
  const reach = radius * 3.2;
  const top = projectGroundPoint(camera, at.clone().setY(at.y + reach), rect);
  const bottom = projectGroundPoint(camera, at.clone().setY(at.y - reach), rect);
  if (!top || !bottom) return false;
  return distanceToPath([top, bottom], local) <= tolerancePx;
}
