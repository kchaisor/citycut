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
  if (!attr || mesh.userData.whiteCardVertexColors) return;
  mesh.userData.whiteCardVertexColors = new Float32Array(attr.array);
}

function applyTerrainVertexCard(mesh: THREE.Mesh, whiteCardOn: boolean): void {
  const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  const base = mesh.userData.whiteCardVertexColors as Float32Array | undefined;
  if (!attr || !base) return;
  if (whiteCardOn) {
    // Same token as the flat ground, in the linear working space vertex colours use.
    const card = new THREE.Color(getColour("--card-ground"));
    for (let i = 0; i < base.length; i += 3) {
      attr.array[i] = card.r;
      attr.array[i + 1] = card.g;
      attr.array[i + 2] = card.b;
    }
  } else {
    attr.array.set(base);
  }
  attr.needsUpdate = true;
}

function snapshotMaterialRest(material: THREE.MeshStandardMaterial): void {
  if (material.userData.whiteCardRestHex !== undefined) return;
  material.userData.whiteCardRestHex = `#${material.color.getHexString()}`;
}

export function snapshotWhiteCardColors(root: THREE.Object3D, colourMode: BuildingColourMode): void {
  snapshotBuildingViewportColors(root, colourMode);
  snapshotSunStudySurfaceColors(root);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name === "Terrain") snapshotTerrainVertexColors(mesh);
    forEachStandardMaterial(mesh, snapshotMaterialRest);
  });
}

function cardFillForMesh(mesh: THREE.Mesh): string {
  if (mesh.name === "Ground" || mesh.name === "Terrain") return getColour("--card-ground");
  return getColour("--card-white");
}

export function applyWhiteCardTint(root: THREE.Object3D, whiteCardOn: boolean): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name === "Terrain") {
      applyTerrainVertexCard(mesh, whiteCardOn);
      return;
    }
    const name = mesh.name || mesh.parent?.name || "";
    const surface =
      BUILDING_NAMES.test(name) ||
      name === "Buildings-manual" ||
      name === "Buildings-site" ||
      name === "Ground" ||
      name === "Green" ||
      name === "Water" ||
      name === "Roads";
    if (!surface) return;
    forEachStandardMaterial(mesh, (material) => {
      const rest = material.userData.whiteCardRestHex as string | undefined;
      if (!rest) return;
      material.color.setStyle(whiteCardOn ? cardFillForMesh(mesh) : rest);
      applyMatteFinish(material);
    });
  });
}

export function whiteCardViewportLighting(whiteCard: boolean): {
  fillKeyLight: number;
  fillAmbient: number;
  fillHemi: number;
} {
  if (!whiteCard) {
    return { fillKeyLight: 1.35, fillAmbient: 0.28, fillHemi: 0.7 };
  }
  return { fillKeyLight: 0.95, fillAmbient: 0.42, fillHemi: 0.85 };
}
