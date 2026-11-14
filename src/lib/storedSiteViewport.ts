import * as THREE from "three";
import { applyMatteFinish } from "./matteMaterial";
import { getColour } from "./colours";
import type { BuildingFeat } from "../types";
import {
  applyBuildingSolarNeutral,
  buildingViewportFill,
  type BuildingColourMode,
} from "./buildingViewportColor";
import { applyPrimaryViewportTint } from "./primaryViewport";

const STORED_BUILDING_MESH = "Buildings-stored-mesh";
const STORED_STRUCTURE_MESH = "StoredSiteStructure";

function forEachStandardMaterial(mesh: THREE.Mesh, fn: (material: THREE.MeshStandardMaterial) => void) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const item of materials) {
    if (item instanceof THREE.MeshStandardMaterial) fn(item);
  }
}

function storedMeshBuildingsById(buildings: readonly BuildingFeat[]): Map<number, BuildingFeat> {
  const map = new Map<number, BuildingFeat>();
  for (const building of buildings) {
    if (building.storedSiteMesh) map.set(building.id, building);
  }
  return map;
}

function snapshotStoredSitePrimaryRest(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name !== STORED_BUILDING_MESH && mesh.name !== STORED_STRUCTURE_MESH) return;
    forEachStandardMaterial(mesh, (material) => {
      material.userData.primaryRestHex = `#${material.color.getHexString()}`;
    });
  });
}

export function snapshotStoredSiteViewportColors(
  root: THREE.Object3D,
  colourMode: BuildingColourMode,
  buildingsById: Map<number, BuildingFeat>,
): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const isStructure = mesh.name === STORED_STRUCTURE_MESH;
    const isBuilding = mesh.name === STORED_BUILDING_MESH;
    if (!isStructure && !isBuilding) return;
    const buildingId = mesh.userData.buildingId as number | undefined;
    const building = buildingId != null ? buildingsById.get(buildingId) : undefined;
    const fill = isStructure
      ? getColour("--stored-site-structure")
      : buildingViewportFill(colourMode, building?.use, building?.source);
    forEachStandardMaterial(mesh, (material) => {
      material.userData.viewportFill = fill;
      material.color.setStyle(fill);
      applyMatteFinish(material);
    });
  });
}

export function syncStoredSiteViewport(
  root: THREE.Object3D,
  buildings: readonly BuildingFeat[],
  colourMode: BuildingColourMode,
  primaryView: boolean,
  solarDiagramOn: boolean,
  solarNeutralFill: string,
): void {
  const buildingsById = storedMeshBuildingsById(buildings);
  snapshotStoredSiteViewportColors(root, colourMode, buildingsById);
  snapshotStoredSitePrimaryRest(root);
  applyBuildingSolarNeutral(root, solarDiagramOn, solarNeutralFill);
  applyPrimaryViewportTint(root, primaryView);
}