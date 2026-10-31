import * as THREE from "three";
import { buildingIdFromIntersection, pickBuildingIdAtClient } from "./buildingPick";

export type BuildingHoverPickGate = {
  pointerDown: boolean;
  orbitActive: boolean;
  orbitCooldownUntil: number;
};

export function hoverPickBlocked(gate: BuildingHoverPickGate, now = performance.now()): boolean {
  return gate.pointerDown || gate.orbitActive || now < gate.orbitCooldownUntil;
}

export function pickBuildingIdAtClientFromClips(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  root: THREE.Object3D,
  clientX: number,
  clientY: number,
  clipForBuilding: (buildingId: number) => { x: number; y: number; width: number; height: number } | null,
  buildingIds: readonly number[],
): number | null {
  let candidate: number | null = null;
  let bestArea = Infinity;
  for (const buildingId of buildingIds) {
    const clip = clipForBuilding(buildingId);
    if (!clip || clip.width < 8 || clip.height < 8) continue;
    if (
      clientX < clip.x ||
      clientX > clip.x + clip.width ||
      clientY < clip.y ||
      clientY > clip.y + clip.height
    ) {
      continue;
    }
    const area = clip.width * clip.height;
    if (area < bestArea) {
      bestArea = area;
      candidate = buildingId;
    }
  }
  if (candidate == null) return null;
  const verified = pickBuildingIdAtClient(canvas, camera, root, clientX, clientY);
  return verified === candidate ? verified : verified;
}

export function pickBuildingHoverAtClient(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  root: THREE.Object3D,
  clientX: number,
  clientY: number,
  clipForBuilding?: (buildingId: number) => { x: number; y: number; width: number; height: number } | null,
  buildingIds?: readonly number[],
): number | null {
  if (clipForBuilding && buildingIds?.length) {
    return pickBuildingIdAtClientFromClips(
      canvas,
      camera,
      root,
      clientX,
      clientY,
      clipForBuilding,
      buildingIds,
    );
  }
  return pickBuildingIdAtClient(canvas, camera, root, clientX, clientY);
}

export function raycastBuildingId(
  raycaster: THREE.Raycaster,
  pointer: THREE.Vector2,
  camera: THREE.Camera,
  root: THREE.Object3D,
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement,
): number | null {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(root, true);
  for (const hit of hits) {
    const buildingId = buildingIdFromIntersection(hit);
    if (buildingId != null) return buildingId;
  }
  return null;
}
