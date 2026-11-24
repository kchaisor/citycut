import * as THREE from "three";
import type { Pt } from "../types";
import type { ArrowShape } from "./diagramArrows";
import { sampleTerrain } from "./terrain";
import type { CityModel } from "../types";

export const ARROW_LIFT_EPSILON_M = 0.05;

export type GroundAt = (east: number, north: number) => number;

export function groundAtFor(model: Pick<CityModel, "terrain" | "sideM">): GroundAt {
  const field = model.terrain;
  return field ? (east, north) => sampleTerrain(field, east, north, model.sideM) : () => 0;
}

export function arrowShapeGeometry(shape: ArrowShape, groundAt: GroundAt, heightM: number): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const vertex = (point: Pt) => positions.push(point[0], groundAt(point[0], point[1]) + heightM + ARROW_LIFT_EPSILON_M, -point[1]);
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
