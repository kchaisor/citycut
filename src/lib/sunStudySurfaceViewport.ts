import * as THREE from "three";
import { applyMatteFinish } from "./matteMaterial";

/** Screen-only tints while the sun path is on (lit ground target ~RGB 200–215). */
export const SUN_STUDY_TERRAIN_VERTEX_SCALE = 0.54;
export const SUN_STUDY_GROUND_COLOR_SCALE = 0.58;
export const SUN_STUDY_GREEN_COLOR_SCALE = 0.62;
export const SUN_STUDY_ROAD_COLOR_SCALE = 0.64;
export const SUN_STUDY_RAIL_COLOR_SCALE = 0.64;
export const SUN_STUDY_WATER_COLOR_SCALE = 0.82;

const SURFACE_MESH_NAMES = new Set(["Terrain", "Ground", "Green", "Water", "Roads", "Rail"]);

function isSunStudySurfaceMesh(mesh: THREE.Mesh): boolean {
  if (SURFACE_MESH_NAMES.has(mesh.name)) return true;
  const parentName = mesh.parent?.name ?? "";
  return SURFACE_MESH_NAMES.has(parentName);
}

function forEachStandardMaterial(mesh: THREE.Mesh, fn: (material: THREE.MeshStandardMaterial) => void) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const item of materials) {
    if (item instanceof THREE.MeshStandardMaterial) fn(item);
  }
}

function scaleForMesh(mesh: THREE.Mesh): number {
  switch (mesh.name) {
    case "Terrain":
      return SUN_STUDY_TERRAIN_VERTEX_SCALE;
    case "Ground":
      return SUN_STUDY_GROUND_COLOR_SCALE;
    case "Green":
      return SUN_STUDY_GREEN_COLOR_SCALE;
    case "Water":
      return SUN_STUDY_WATER_COLOR_SCALE;
    case "Roads":
      return SUN_STUDY_ROAD_COLOR_SCALE;
    case "Rail":
      return SUN_STUDY_RAIL_COLOR_SCALE;
    default:
      return SUN_STUDY_GROUND_COLOR_SCALE;
  }
}

function snapshotTerrainVertexColors(mesh: THREE.Mesh): void {
  const attr = mesh.geometry.getAttribute("color");
  if (!attr || mesh.userData.sunStudyVertexColors) return;
  mesh.userData.sunStudyVertexColors = new Float32Array(attr.array);
}

function applyTerrainVertexTint(mesh: THREE.Mesh, sunStudyOn: boolean, scale: number): void {
  const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  const base = mesh.userData.sunStudyVertexColors as Float32Array | undefined;
  if (!attr || !base) return;
  if (sunStudyOn) {
    for (let i = 0; i < base.length; i++) attr.array[i] = base[i]! * scale;
  } else {
    attr.array.set(base);
  }
  attr.needsUpdate = true;
}

function snapshotMaterialViewportColor(material: THREE.MeshStandardMaterial): void {
  if (material.userData.sunStudyRestHex !== undefined) return;
  material.userData.sunStudyRestHex = `#${material.color.getHexString()}`;
}

function applyMaterialViewportTint(
  material: THREE.MeshStandardMaterial,
  sunStudyOn: boolean,
  scale: number,
): void {
  const rest = material.userData.sunStudyRestHex as string | undefined;
  if (!rest) return;
  if (sunStudyOn) {
    material.color.setStyle(rest);
    material.color.multiplyScalar(scale);
  } else {
    material.color.setStyle(rest);
  }
  applyMatteFinish(material);
}

/** Remember terrain vertex colours and ground material colours before any sun-study tint. */
export function snapshotSunStudySurfaceColors(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !isSunStudySurfaceMesh(mesh)) return;
    if (mesh.name === "Terrain") snapshotTerrainVertexColors(mesh);
    forEachStandardMaterial(mesh, snapshotMaterialViewportColor);
  });
}

/** Darken ground, roads, and water in the viewport during sun study; buildings stay separate. */
export function applySunStudySurfaceTint(root: THREE.Object3D, sunStudyOn: boolean): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !isSunStudySurfaceMesh(mesh)) return;
    const scale = scaleForMesh(mesh);
    if (mesh.name === "Terrain") {
      applyTerrainVertexTint(mesh, sunStudyOn, scale);
      return;
    }
    forEachStandardMaterial(mesh, (material) => applyMaterialViewportTint(material, sunStudyOn, scale));
  });
}

/** Scale a CSS hex fill for tests (same math as material multiplyScalar). */
export function tintSunStudyHex(hex: string, scale: number): string {
  const color = new THREE.Color(hex);
  color.multiplyScalar(scale);
  return `#${color.getHexString()}`;
}
