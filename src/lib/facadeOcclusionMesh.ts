import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { computeBoundsTree, acceleratedRaycast, disposeBoundsTree } from "three-mesh-bvh";
import { extrudePart } from "./buildCity";
import { footprintBase } from "./terrain";
import type { BuildingFeat, CityModel } from "../types";

const BUILDING_SURFACE_LIFT_M = 0.05;

THREE.Mesh.prototype.raycast = acceleratedRaycast;

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

function partsForBuilding(building: BuildingFeat, base: number): { ring: import("../types").Ring; holes: import("../types").Ring[]; height: number; base: number }[] {
  if (building.extrusionParts && building.extrusionParts.length > 0) {
    return building.extrusionParts.map((part) => ({
      ring: part.ring,
      holes: part.holes,
      height: part.height,
      base: base + (part.base ?? 0),
    }));
  }
  return [{ ring: building.ring, holes: building.holes, height: building.height, base }];
}

export function buildFacadeOcclusionMesh(model: CityModel): THREE.Mesh | null {
  const geometries: THREE.BufferGeometry[] = [];
  for (const building of model.buildings) {
    if (building.meshDrawnBy != null) continue;
    const footBase = (model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0) + BUILDING_SURFACE_LIFT_M;
    for (const part of partsForBuilding(building, footBase)) {
      const geometry = extrudePart(part.ring, part.holes, part.height, part.base);
      if (geometry) geometries.push(geometry);
    }
  }
  if (geometries.length === 0) return null;
  const merged = mergeGeometries(geometries, false);
  if (!merged) return null;
  merged.computeBoundsTree();
  const material = new THREE.MeshBasicMaterial();
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = "FacadeOcclusion";
  return mesh;
}
