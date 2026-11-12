import * as THREE from "three";
import { getColour } from "./colours";
import { applyMatteFinish } from "./matteMaterial";
import { snapshotBuildingViewportColors, type BuildingColourMode } from "./buildingViewportColor";
import { snapshotSunStudySurfaceColors } from "./sunStudySurfaceViewport";

const BUILDING_NAMES = /^Buildings|^source:/;

function forEachStandardMaterial(mesh: THREE.Mesh, fn: (material: THREE.MeshStandardMaterial) => void) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const item of materials) {
    if (item instanceof THREE.MeshStandardMaterial) fn(item);
  }
}

function snapshotTerrainVertexColors(mesh: THREE.Mesh): void {
  const attr = mesh.geometry.getAttribute("color");
  if (!attr || mesh.userData.primaryVertexColors) return;
  mesh.userData.primaryVertexColors = new Float32Array(attr.array);
}

function applyTerrainPrimary(mesh: THREE.Mesh, primaryOn: boolean): void {
  const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  const base = mesh.userData.primaryVertexColors as Float32Array | undefined;
  if (!attr || !base) return;
  if (primaryOn) {
    const surface = new THREE.Color(getColour("--primary-surface"));
    for (let i = 0; i < base.length; i += 3) {
      attr.array[i] = surface.r;
      attr.array[i + 1] = surface.g;
      attr.array[i + 2] = surface.b;
    }
  } else {
    attr.array.set(base);
  }
  attr.needsUpdate = true;
}

function snapshotMaterialRest(material: THREE.MeshStandardMaterial): void {
  material.userData.primaryRestHex = `#${material.color.getHexString()}`;
}

export function snapshotPrimaryViewportColors(root: THREE.Object3D, colourMode: BuildingColourMode): void {
  snapshotBuildingViewportColors(root, colourMode);
  snapshotSunStudySurfaceColors(root);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name === "Terrain") snapshotTerrainVertexColors(mesh);
    forEachStandardMaterial(mesh, snapshotMaterialRest);
  });
}

function primaryFillForMesh(mesh: THREE.Mesh): string {
  if (mesh.name === "Ground" || mesh.name === "Terrain") return getColour("--primary-surface");
  if (mesh.name === "Roads") {
    const grade = mesh.userData.roadGrade as string | undefined;
    if (grade === "path") return getColour("--primary-footpath");
    return getColour("--primary-road");
  }
  return getColour("--primary-building");
}

export function applyPrimaryViewportTint(root: THREE.Object3D, primaryOn: boolean): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name === "Terrain") {
      applyTerrainPrimary(mesh, primaryOn);
      return;
    }
    const name = mesh.name || mesh.parent?.name || "";
    const surface =
      BUILDING_NAMES.test(name) ||
      name === "Buildings-manual" ||
      name === "Buildings-site" ||
      name === "Ground" ||
      name === "Roads";
    if (!surface) return;
    forEachStandardMaterial(mesh, (material) => {
      const rest = material.userData.primaryRestHex as string | undefined;
      if (!rest) return;
      material.color.setStyle(primaryOn ? primaryFillForMesh(mesh) : rest);
      applyMatteFinish(material);
    });
  });
}

export function primaryViewportLighting(primaryView: boolean): {
  fillKeyLight: number;
  fillAmbient: number;
  fillHemi: number;
} {
  if (!primaryView) {
    return { fillKeyLight: 1.35, fillAmbient: 0.28, fillHemi: 0.7 };
  }
  return { fillKeyLight: 0.95, fillAmbient: 0.42, fillHemi: 0.85 };
}

export {
  snapshotPrimaryViewportColors as snapshotWhiteCardColors,
  applyPrimaryViewportTint as applyWhiteCardTint,
  primaryViewportLighting as whiteCardViewportLighting,
};
