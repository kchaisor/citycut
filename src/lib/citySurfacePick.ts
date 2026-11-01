import * as THREE from "three";
import { CITYCUT_SCREEN_ONLY } from "./screenOnly";

const SURFACE_PICK_SKIP = new Set([
  "IntroCutRing",
  "GroundEdge",
  "Site::Boundary",
  "RailLines",
  "TramLines",
  "BuildingEdges",
  "RoofLines",
  "HeightEditOverlay",
]);

function shouldSkipSurfaceHit(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (node.userData[CITYCUT_SCREEN_ONLY]) return true;
    if (SURFACE_PICK_SKIP.has(node.name)) return true;
    node = node.parent;
  }
  return false;
}

export function pickCitySurfaceY(
  root: THREE.Object3D,
  east: number,
  north: number,
  rayTopY = 500,
): number | null {
  root.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3(east, rayTopY, -north);
  raycaster.set(origin, new THREE.Vector3(0, -1, 0));
  const hits = raycaster.intersectObject(root, true);
  for (const hit of hits) {
    if (shouldSkipSurfaceHit(hit.object)) continue;
    if (!Number.isFinite(hit.point.y)) continue;
    return hit.point.y;
  }
  return null;
}
