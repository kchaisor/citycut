import { signedArea, openRing } from "../geo";
import type { BuildingFeat } from "../../types";
import type { StoredSiteFootprint } from "./types";

export const STORED_SITE_MESH_ID_BASE = -3_000_000;

export function storedMeshBuildingsFromFootprints(footprints: StoredSiteFootprint[]): {
  buildings: BuildingFeat[];
  meshKeyByBuildingId: Record<number, string>;
  buildingIdByMeshKey: Record<string, number>;
} {
  const buildings: BuildingFeat[] = [];
  const meshKeyByBuildingId: Record<number, string> = {};
  const buildingIdByMeshKey: Record<string, number> = {};
  let index = 0;
  for (const fp of footprints) {
    if (fp.props.role !== "building") continue;
    const height = Math.max(0.1, fp.props.topZ - fp.props.baseZ);
    const id = STORED_SITE_MESH_ID_BASE - index;
    index++;
    const building: BuildingFeat = {
      id,
      ring: fp.ring,
      holes: fp.holes,
      height,
      use: "unclassified",
      source: "none",
      storedSiteMesh: true,
      storedSiteMeshKey: fp.id,
      storedSiteBaseZ: fp.props.baseZ,
      storedSiteTopZ: fp.props.topZ,
      storedSiteLayer: fp.props.layer,
    };
    buildings.push(building);
    meshKeyByBuildingId[id] = fp.id;
    buildingIdByMeshKey[fp.id] = id;
  }
  return { buildings, meshKeyByBuildingId, buildingIdByMeshKey };
}

export function storedMeshFootprintAreaM2(building: BuildingFeat): number {
  const outer = Math.abs(signedArea(openRing(building.ring)));
  let holes = 0;
  for (const hole of building.holes) holes += Math.abs(signedArea(openRing(hole)));
  return Math.max(0, outer - holes);
}
