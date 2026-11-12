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

function snapshotVertexColors(mesh: THREE.Mesh, key: string): void {
  const attr = mesh.geometry.getAttribute("color");
  if (!attr || mesh.userData[key]) return;
  mesh.userData[key] = new Float32Array(attr.array);
}

function snapshotTerrainVertexColors(mesh: THREE.Mesh): void {
  snapshotVertexColors(mesh, "primaryVertexColors");
}

function snapshotPlinthVertexColors(mesh: THREE.Mesh): void {
  snapshotVertexColors(mesh, "primaryPlinthVertexColors");
}

function applyVertexPrimary(mesh: THREE.Mesh, primaryOn: boolean, restoreKey: string, fillHex: string): void {
  const attr = mesh.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  const base = mesh.userData[restoreKey] as Float32Array | undefined;
  if (!attr || !base) return;
  if (primaryOn) {
    const surface = new THREE.Color(fillHex);
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

function applyTerrainPrimary(mesh: THREE.Mesh, primaryOn: boolean): void {
  applyVertexPrimary(mesh, primaryOn, "primaryVertexColors", getColour("--primary-surface"));
}

function applyPlinthPrimary(mesh: THREE.Mesh, primaryOn: boolean): void {
  applyVertexPrimary(mesh, primaryOn, "primaryPlinthVertexColors", getColour("--plinth-wall"));
}

function restorePrimaryRoadMaterial(mesh: THREE.Mesh): void {
  const rest = mesh.userData.primaryRoadRestMaterial as THREE.Material | undefined;
  if (!rest) return;
  const basic = mesh.material;
  mesh.material = rest;
  if (basic instanceof THREE.MeshBasicMaterial && basic !== rest) basic.dispose();
  delete mesh.userData.primaryRoadRestMaterial;
}

function applyPrimaryRoadMaterial(mesh: THREE.Mesh, primaryOn: boolean): void {
  if (!primaryOn) {
    restorePrimaryRoadMaterial(mesh);
    return;
  }
  if (!(mesh.material instanceof THREE.MeshBasicMaterial)) {
    mesh.userData.primaryRoadRestMaterial = mesh.material;
    const grade = mesh.userData.roadGrade as string | undefined;
    const fill = grade === "path" ? getColour("--primary-footpath") : getColour("--primary-road");
    mesh.material = new THREE.MeshBasicMaterial({
      color: fill,
      toneMapped: false,
    });
  }
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
    if (mesh.name === "BasePlinth") snapshotPlinthVertexColors(mesh);
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
      forEachStandardMaterial(mesh, (material) => {
        material.color.setStyle(primaryOn ? getColour("--primary-surface") : getColour("--primary-building"));
        applyMatteFinish(material);
      });
      return;
    }
    if (mesh.name === "BasePlinth") {
      applyPlinthPrimary(mesh, primaryOn);
      forEachStandardMaterial(mesh, (material) => {
        const rest = material.userData.primaryRestHex as string | undefined;
        if (primaryOn) {
          material.color.setStyle(getColour("--plinth-wall"));
        } else if (rest) {
          material.color.setStyle(rest);
        }
        applyMatteFinish(material);
      });
      return;
    }
    if (mesh.name === "Roads") {
      applyPrimaryRoadMaterial(mesh, primaryOn);
      return;
    }
    const name = mesh.name || mesh.parent?.name || "";
    const surface =
      BUILDING_NAMES.test(name) ||
      name === "Buildings-manual" ||
      name === "Buildings-site" ||
      name === "Ground";
    if (!surface) return;
    forEachStandardMaterial(mesh, (material) => {
      const rest = material.userData.primaryRestHex as string | undefined;
      if (!rest) return;
      material.color.setStyle(primaryOn ? primaryFillForMesh(mesh) : rest);
      applyMatteFinish(material);
    });
  });
}

export function primaryRoadReadsOnCanvas(material: THREE.Material): boolean {
  if (!(material instanceof THREE.MeshBasicMaterial)) return false;
  const hex = `#${material.color.getHexString()}`.toLowerCase();
  return hex === getColour("--primary-road").toLowerCase();
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
