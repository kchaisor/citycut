import type { BuildingEnrichmentRecord } from "./buildingEnrichmentTiles";
import { fillForTileUse, landingBuildingFill } from "./landingBuildingFill";
import type { BuildingFeat } from "../types";

/** Buildings that need the live GeoJSON overlay instead of (or on top of) enrichment tiles. */
export function landingLiveColourBuildings(
  buildings: BuildingFeat[],
  byId: Map<string, BuildingEnrichmentRecord>,
): BuildingFeat[] {
  if (byId.size === 0) return buildings;
  return buildings.filter((building) => needsLiveColourOverlay(building, byId));
}

export function needsLiveColourOverlay(
  building: BuildingFeat,
  byId: Map<string, BuildingEnrichmentRecord>,
): boolean {
  const id = building.overtureId;
  if (!id) return true;
  const record = byId.get(id);
  if (!record) return true;
  return landingBuildingFill(building) !== fillForTileUse(record.use);
}
