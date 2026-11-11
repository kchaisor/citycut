import type { RegionId } from "../region";
import { VICMAP_CONTOUR_ATTRIBUTION, VICMAP_METRO_DATASET_URL } from "../vicmapContours";
import { VICMAP_PROPERTY_ATTRIBUTION } from "../vicmapSiteParcel";
import {
  COS_ATTRIBUTION,
  COS_CONTOURS_DATASET_URL,
  NSW_PLANNING_ATTRIBUTION,
  NSW_PLANNING_DATASET_URL,
  NSW_SPATIAL_ATTRIBUTION,
  NSW_SPATIAL_DATASET_URL,
} from "./nsw";

export type CityCutLayer =
  | "cadastre"
  | "easements"
  | "road-corridors"
  | "road-centrelines"
  | "water"
  | "contours"
  | "ground"
  | "planning"
  | "buildings";

export type RegionSource = {
  id: string;
  label: string;
  layers: CityCutLayer[];
  attribution: string;
  datasetUrl: string | null;
};

export function regionSources(region: RegionId): RegionSource[] {
  const all: Record<RegionId, RegionSource[]> = {
    vic: [
      { id: "vicmap-contours", label: "Vicmap Elevation contours", layers: ["contours", "ground"], attribution: VICMAP_CONTOUR_ATTRIBUTION, datasetUrl: VICMAP_METRO_DATASET_URL },
      { id: "vicmap-property", label: "Vicmap Property parcels", layers: ["cadastre"], attribution: VICMAP_PROPERTY_ATTRIBUTION, datasetUrl: null },
      { id: "vicmap-planning", label: "Vicmap Planning zones and overlays", layers: ["planning"], attribution: "Vicmap Planning © State of Victoria (Department of Transport and Planning).", datasetUrl: null },
    ],
    nsw: [
      {
        id: "nsw-spatial",
        label: "NSW Spatial Services (lots, easements, road corridors, centrelines, water, contours)",
        layers: ["cadastre", "easements", "road-corridors", "road-centrelines", "water", "contours", "ground"],
        attribution: NSW_SPATIAL_ATTRIBUTION,
        datasetUrl: NSW_SPATIAL_DATASET_URL,
      },
      {
        id: "nsw-planning",
        label: "NSW EPI Primary Planning Layers (zoning, height of building, FSR, heritage)",
        layers: ["planning"],
        attribution: NSW_PLANNING_ATTRIBUTION,
        datasetUrl: NSW_PLANNING_DATASET_URL,
      },
      { id: "cos-contours", label: "City of Sydney Terrain contours (1 m, 2020)", layers: ["contours", "ground"], attribution: COS_ATTRIBUTION, datasetUrl: COS_CONTOURS_DATASET_URL },
    ],
  };
  return all[region];
}

export function regionCredit(region: RegionId | null | undefined): string | null {
  if (region !== "nsw") return null;
  return [NSW_SPATIAL_ATTRIBUTION, NSW_PLANNING_ATTRIBUTION, COS_ATTRIBUTION].join(" · ");
}

export const NSW_BUILDING_ESTIMATE_NOTE =
  "Building heights in NSW are estimates from Overture/OpenStreetMap (height, floors × 3 m, or a default); NSW has no open measured building heights.";
