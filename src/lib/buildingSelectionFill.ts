import * as THREE from "three";
import type { CityModel } from "../types";
import { extrudePart, SELECTION_OVERLAY_RENDER_ORDER } from "./buildCity";
import { getColour } from "./colours";
import { matteStandardMaterial } from "./matteMaterial";
import { SURFACE } from "./surfaceLayers";
import { footprintBase } from "./terrain";

export const BUILDING_SELECTION_FILL_OPACITY = 1;

function geometriesForBuilding(model: CityModel, buildingId: number): THREE.BufferGeometry[] {
  const building = model.buildings.find((item) => item.id === buildingId);
  if (!building) return [];
  const base =
    (model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0) + SURFACE.building.lift;
  const parts =
    building.extrusionParts && building.extrusionParts.length > 0
      ? building.extrusionParts
      : [{ ring: building.ring, holes: building.holes, height: building.height }];
  const geometries: THREE.BufferGeometry[] = [];
  for (const part of parts) {
    const geometry = extrudePart(part.ring, part.holes, part.height, base + (part.base ?? 0));
    if (geometry) geometries.push(geometry);
  }
  return geometries;
}

export function createBuildingSelectionFillMaterial(): THREE.MeshStandardMaterial {
  const material = matteStandardMaterial({
    color: getColour("--building-selection-fill"),
    transparent: true,
    opacity: BUILDING_SELECTION_FILL_OPACITY,
    depthWrite: false,
  });
  material.depthTest = true;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  material.name = "BuildingSelectionFill";
  return material;
}

export function appendBuildingSelectionFillMeshes(
  group: THREE.Group,
  model: CityModel,
  buildingIds: readonly number[],
  material: THREE.MeshStandardMaterial,
): number {
  const unique = [...new Set(buildingIds.map((id) => Number(id)))];
  let meshCount = 0;
  for (const buildingId of unique) {
    for (const geometry of geometriesForBuilding(model, buildingId)) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "BuildingSelectionFill";
      mesh.renderOrder = SELECTION_OVERLAY_RENDER_ORDER;
      group.add(mesh);
      meshCount += 1;
    }
  }
  return meshCount;
}
