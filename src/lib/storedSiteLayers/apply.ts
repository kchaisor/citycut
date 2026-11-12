import type { BuildingFeat, CityModel, LonLat } from "../../types";
import type { FrameGroundSize, SiteFrameShape } from "../siteFrame";
import { hideNonMeshBuildingsOverlappingStoredSite } from "./overlap";
import { storedMeshBuildingsFromFootprints } from "./buildings";
import { loadStoredSiteLayerPack } from "./load";
import type { StoredSiteLayerState, StoredSiteStructureOutline } from "./types";

export type StoredSiteLayerApplyResult = {
  buildings: BuildingFeat[];
  layer: StoredSiteLayerState | null;
  structures: StoredSiteStructureOutline[];
};

export async function applyStoredSiteLayerToCut(input: {
  center: LonLat;
  sideM: number;
  frameShape: SiteFrameShape;
  frameSize?: FrameGroundSize;
  buildings: BuildingFeat[];
  signal?: AbortSignal;
}): Promise<StoredSiteLayerApplyResult> {
  const pack = await loadStoredSiteLayerPack(
    input.center,
    input.sideM,
    input.frameShape,
    input.frameSize,
    input.signal,
  );
  if (!pack) {
    return { buildings: input.buildings, layer: null, structures: [] };
  }
  const buildingFootprints = pack.footprints.filter((fp) => fp.props.role === "building");
  const { buildings: filtered, hiddenCount } = hideNonMeshBuildingsOverlappingStoredSite(
    input.buildings,
    pack.footprints,
  );
  const mesh = storedMeshBuildingsFromFootprints(buildingFootprints);
  const scrubbed = hideNonMeshBuildingsOverlappingStoredSite([...filtered, ...mesh.buildings], pack.footprints);
  return {
    buildings: scrubbed.buildings,
    structures: pack.structures,
    layer: {
      id: pack.manifest.id,
      label: pack.manifest.name,
      sourceCredit: "Kelvin mesh (Nov 2026)",
      hiddenOvertureCount: hiddenCount,
      meshBuildingCount: mesh.buildings.length,
      structureCount: pack.structures.length,
      meshKeyByBuildingId: mesh.meshKeyByBuildingId,
      buildingIdByMeshKey: mesh.buildingIdByMeshKey,
      zone: pack.zone,
      manifest: pack.manifest,
    },
  };
}

export function storedSiteStructuresOnModel(model: CityModel): StoredSiteStructureOutline[] {
  return model.storedSiteStructures ?? [];
}
