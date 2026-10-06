import * as THREE from "three";
import { applyMatteFinish } from "./matteMaterial";
import type { BuildingUse } from "../types";
import { getColour } from "./colours";
import { BUILDING_USE_META, SOURCE_META, buildingLayerName, uniformBuildingColor } from "./buildingUse";

export type BuildingColourMode = {
  colourByUse: boolean;
  uniformBuildings: boolean;
  colourBySource: boolean;
};

/** Pick the viewport fill for one building bucket before any solar neutral override. */
export function buildingViewportFill(
  mode: BuildingColourMode,
  use: BuildingUse | undefined,
  sourceKey: string | undefined,
): string {
  if (mode.colourBySource && sourceKey) {
    const meta = SOURCE_META[sourceKey as keyof typeof SOURCE_META];
    if (meta) return meta.color;
  }
  if (mode.uniformBuildings || !mode.colourByUse || !use) return uniformBuildingColor();
  return BUILDING_USE_META[use].color;
}

export function parseBuildingBucketName(name: string): { use?: BuildingUse; sourceKey?: string } {
  if (name.startsWith("source:")) return { sourceKey: name.slice("source:".length) };
  const use = (Object.keys(BUILDING_USE_META) as BuildingUse[]).find((key) => buildingLayerName(key) === name);
  return use ? { use } : {};
}

function buildingMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = mesh.name || mesh.parent?.name || "";
    if (name.startsWith("Buildings") || name.startsWith("source:")) meshes.push(mesh);
  });
  return meshes;
}

function forEachStandardMaterial(mesh: THREE.Mesh, fn: (material: THREE.MeshStandardMaterial) => void) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const item of materials) {
    if (item instanceof THREE.MeshStandardMaterial) fn(item);
  }
}

/** Remember each building material's intended viewport colour on first touch. */
export function snapshotBuildingViewportColors(root: THREE.Object3D, mode: BuildingColourMode): void {
  for (const mesh of buildingMeshes(root)) {
    const name = mesh.name || mesh.parent?.name || "";
    if (name === "Buildings-manual") {
      const fill = getColour("--building-manual");
      forEachStandardMaterial(mesh, (material) => {
        material.userData.viewportFill = fill;
        material.color.setStyle(fill);
        applyMatteFinish(material);
      });
      continue;
    }
    if (name === "Buildings-site" || name === "Buildings::Site") {
      const fill = getColour("--site-building");
      forEachStandardMaterial(mesh, (material) => {
        material.userData.viewportFill = fill;
        material.color.setStyle(fill);
        applyMatteFinish(material);
      });
      continue;
    }
    const { use, sourceKey } = parseBuildingBucketName(name);
    const fill = buildingViewportFill(mode, use, sourceKey);
    forEachStandardMaterial(mesh, (material) => {
      if (material.userData.viewportFill === undefined) material.userData.viewportFill = fill;
      material.color.setStyle(fill);
      applyMatteFinish(material);
    });
  }
}

/** Apply or remove the solar neutral override without rebuilding geometry. */
export function applyBuildingSolarNeutral(root: THREE.Object3D, solarDiagramOn: boolean, neutralFill: string): void {
  for (const mesh of buildingMeshes(root)) {
    forEachStandardMaterial(mesh, (material) => {
      const rest = material.userData.viewportFill as string | undefined;
      if (!rest) return;
      material.color.setStyle(solarDiagramOn ? neutralFill : rest);
      if (solarDiagramOn) {
        material.emissive.setStyle(neutralFill);
        material.emissiveIntensity = 0.06;
      } else {
        material.emissive.setHex(0x000000);
        material.emissiveIntensity = 0;
      }
      applyMatteFinish(material);
    });
  }
}

/** During PNG export, briefly show the ordinary building colours even when the sun diagram is on. */
export function withBuildingExportColours<T>(root: THREE.Object3D, solarDiagramOn: boolean, work: () => T): T {
  if (!solarDiagramOn) return work();
  const saved: {
    material: THREE.MeshStandardMaterial;
    color: THREE.Color;
    emissive: THREE.Color;
    emissiveIntensity: number;
  }[] = [];
  for (const mesh of buildingMeshes(root)) {
    forEachStandardMaterial(mesh, (material) => {
      const rest = material.userData.viewportFill as string | undefined;
      if (!rest) return;
      saved.push({
        material,
        color: material.color.clone(),
        emissive: material.emissive.clone(),
        emissiveIntensity: material.emissiveIntensity,
      });
      material.color.setStyle(rest);
      material.emissive.setHex(0x000000);
      material.emissiveIntensity = 0;
    });
  }
  try {
    return work();
  } finally {
    for (const entry of saved) {
      entry.material.color.copy(entry.color);
      entry.material.emissive.copy(entry.emissive);
      entry.material.emissiveIntensity = entry.emissiveIntensity;
    }
  }
}
