import * as THREE from "three";
import { footprintBase } from "./terrain";
import { SURFACE } from "./surfaceLayers";
import { interiorPoint } from "./useCascade";
import { effectiveBuildingHeightM } from "./buildingHeightResolve";
import type { BuildingFeat, CityModel } from "../types";

export function buildingRoofAnchor(model: CityModel, building: BuildingFeat): THREE.Vector3 {
  const at = interiorPoint(building.ring, building.holes);
  const terrainBase = model.terrain ? footprintBase(model.terrain, building.ring, model.sideM) : 0;
  const base = terrainBase + SURFACE.building.lift;
  const roofY = base + effectiveBuildingHeightM(building);
  return new THREE.Vector3(at[0], roofY, -at[1]);
}
