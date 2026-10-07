import * as THREE from "three";
import { getColour } from "./colours";
import { applyMatteFinish } from "./matteMaterial";


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

function snapshotTerrainVertexColors(mesh: THREE.Mesh): void {
  const attr = mesh.geometry.getAttribute("color");
  if (!attr || mesh.userData.sunStudyVertexColors) return;
  mesh.userData.sunStudyVertexColors = new Float32Array(attr.array);
}

function applyTerrainVertexWhite(mesh: THREE.Mesh, sunStudyOn: boolean): void {
  const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  const base = mesh.userData.sunStudyVertexColors as Float32Array | undefined;
  if (!attr || !base) return;
  if (sunStudyOn) {
    for (let i = 0; i < base.length; i += 3) {
      attr.array[i] = 1;
      attr.array[i + 1] = 1;
      attr.array[i + 2] = 1;
    }
  } else {
    attr.array.set(base);
  }
  attr.needsUpdate = true;
}

function snapshotMaterialViewportColor(material: THREE.MeshStandardMaterial): void {
  if (material.userData.sunStudyRestHex !== undefined) return;
  material.userData.sunStudyRestHex = `#${material.color.getHexString()}`;
}

function sunStudyColorForMesh(mesh: THREE.Mesh): string {
  if (mesh.name === "Water") return getColour("--water-sunpath");
  return getColour("--sun-study-surface");
}

function applyMaterialViewportTint(mesh: THREE.Mesh, material: THREE.MeshStandardMaterial, sunStudyOn: boolean): void {
  const rest = material.userData.sunStudyRestHex as string | undefined;
  if (!rest) return;
  if (sunStudyOn) {
    material.color.setStyle(sunStudyColorForMesh(mesh));
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

/** White ground, roads, and parks during sun study; water uses --water-sunpath. Buildings stay separate. */
export function applySunStudySurfaceTint(root: THREE.Object3D, sunStudyOn: boolean): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !isSunStudySurfaceMesh(mesh)) return;
    if (mesh.name === "Terrain") {
      applyTerrainVertexWhite(mesh, sunStudyOn);
      return;
    }
    forEachStandardMaterial(mesh, (material) => applyMaterialViewportTint(mesh, material, sunStudyOn));
  });
}

/** Resolve the viewport tint for tests. */
export function sunStudyViewportFill(meshName: string, sunStudyOn: boolean): string | null {
  if (!sunStudyOn) return null;
  if (meshName === "Water") return getColour("--water-sunpath");
  if (SURFACE_MESH_NAMES.has(meshName)) return getColour("--sun-study-surface");
  return null;
}
