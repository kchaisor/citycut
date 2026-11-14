import * as THREE from "three";
import { getColour } from "../colours";
import type { StoredSiteBridgePlan } from "./bridgePlan";

export const STORED_SITE_CABLE_MIN_ZOOM = 0.45;
export const STORED_SITE_CABLE_LINE_OPACITY = 0.6;

export function buildStoredSiteBridgeCableObject(
  plan: StoredSiteBridgePlan,
  heightAt: (east: number, north: number) => number,
  lift = 2,
): THREE.LineSegments | null {
  const positions: number[] = [];
  const lines = plan.stayLines3d.length > 0 ? plan.stayLines3d : [];
  for (const line of lines) {
    if (line.length < 2) continue;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const ay = heightAt(a[0], a[1]) + lift;
      const by = heightAt(b[0], b[1]) + lift;
      positions.push(a[0], ay, -a[1], b[0], by, -b[1]);
    }
  }
  if (positions.length < 6) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: getColour("--stored-site-bridge-cable"),
    transparent: true,
    opacity: STORED_SITE_CABLE_LINE_OPACITY,
    depthTest: true,
    linewidth: 1,
  });
  material.name = "StoredSiteBridgeCables";
  const object = new THREE.LineSegments(geometry, material);
  object.name = "StoredSiteBridgeCables";
  object.frustumCulled = false;
  return object;
}