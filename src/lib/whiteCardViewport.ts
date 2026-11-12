import * as THREE from "three";
import { getColour } from "./colours";
import { applyMatteFinish } from "./matteMaterial";

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
    const card = new THREE.Color(getColour("--primary-surface"));
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

export function snapshotWhiteCardTerrainColors(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.name === "Terrain") snapshotTerrainVertexColors(mesh);
  });
}

export function applyWhiteCardGroundTint(root: THREE.Object3D, whiteCardOn: boolean): void {
  const groundFill = getColour("--primary-surface");
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name === "Terrain") {
      applyTerrainVertexCard(mesh, whiteCardOn);
      forEachStandardMaterial(mesh, (material) => {
        const rest = material.userData.primaryRestHex as string | undefined;
        if (!rest) return;
        material.color.setStyle(whiteCardOn ? groundFill : rest);
        applyMatteFinish(material);
      });
      return;
    }
    if (mesh.name === "Ground") {
      forEachStandardMaterial(mesh, (material) => {
        const rest = material.userData.primaryRestHex as string | undefined;
        if (!rest) return;
        material.color.setStyle(whiteCardOn ? groundFill : rest);
        applyMatteFinish(material);
      });
    }
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
