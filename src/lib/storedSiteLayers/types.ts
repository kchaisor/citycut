import type { LonLat, Ring } from "../../types";
import type { StoredSiteBridgePlan } from "./bridgePlan";

export type StoredSiteLayerManifest = {
  id: string;
  name: string;
  source: string;
  epsg: number;
  origin: { mga: [number, number, number]; lonLat: [number, number] };
  bbox: {
    mga: { min: [number, number, number]; max: [number, number, number] };
    lonLatWSEN: [number, number, number, number];
  };
  files: { path: string; structureId?: string }[];
};

export type StoredSiteFootprintRole = "building" | "slab" | "structure";

export type StoredSiteFootprintProps = {
  id: string;
  layer: string;
  baseZ: number;
  topZ: number;
  role: StoredSiteFootprintRole;
};

export type StoredSiteFootprint = {
  id: string;
  ring: Ring;
  holes: Ring[];
  props: StoredSiteFootprintProps;
};

export type StoredSiteStructureOutline = {
  id: string;
  ring: Ring;
  holes: Ring[];
};

export type StoredSiteLayerState = {
  id: string;
  label: string;
  sourceCredit: string;
  hiddenOvertureCount: number;
  meshBuildingCount: number;
  structureCount: number;
  meshKeyByBuildingId: Record<number, string>;
  buildingIdByMeshKey: Record<string, number>;
  zone: number;
  manifest: StoredSiteLayerManifest;
  bridgePlan: StoredSiteBridgePlan | null;
};

export type StoredSiteLayerPack = {
  manifest: StoredSiteLayerManifest;
  footprints: StoredSiteFootprint[];
  structures: StoredSiteStructureOutline[];
  bridgePlan: StoredSiteBridgePlan | null;
  center: LonLat;
  zone: number;
};
