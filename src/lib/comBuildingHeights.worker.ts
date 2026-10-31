import { applyComBuildingHeights } from "./comBuildingHeightsMatch";
import { resolveBuildingHeightsAfterCom } from "./buildingHeightPipeline";
import type { DamFloorRecord } from "./comDevelopmentFloors";
import type { BuildingFeat, LonLat } from "../types";
import type { ComBuildingFootprint } from "./comBuildingHeightsTypes";

export type ComHeightsWorkerRequest = {
  buildings: BuildingFeat[];
  footprints: ComBuildingFootprint[];
  center?: LonLat;
  damRecords?: DamFloorRecord[];
};

export type ComHeightsWorkerResponse = {
  buildings: BuildingFeat[];
  updated: number;
  resolved?: boolean;
  failed?: boolean;
};

self.onmessage = (event: MessageEvent<ComHeightsWorkerRequest>) => {
  try {
    const { buildings, footprints, center, damRecords } = event.data;
    const result = applyComBuildingHeights(buildings, footprints);
    const finalBuildings = center
      ? resolveBuildingHeightsAfterCom(result.buildings, center, footprints, damRecords ?? [])
      : result.buildings;
    const payload: ComHeightsWorkerResponse = {
      buildings: finalBuildings,
      updated: result.updated,
      resolved: Boolean(center),
    };
    self.postMessage(payload);
  } catch {
    const payload: ComHeightsWorkerResponse = {
      buildings: event.data.buildings,
      updated: 0,
      failed: true,
    };
    self.postMessage(payload);
  }
};
