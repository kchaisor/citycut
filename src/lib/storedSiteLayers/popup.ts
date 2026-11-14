import type { BuildingFeat } from "../../types";
import { storedMeshFootprintAreaM2 } from "./buildings";

export function storedSiteMeshPopupLines(building: BuildingFeat): {
  useLine: string;
  heightStoreysLine: string;
  footprintM2: number;
} | null {
  if (!building.storedSiteMesh) return null;
  const height =
    building.storedSiteTopZ != null && building.storedSiteBaseZ != null
      ? building.storedSiteTopZ - building.storedSiteBaseZ
      : building.height;
  const footprintM2 = storedMeshFootprintAreaM2(building);
  return {
    useLine: "Building · Kelvin mesh (Nov 2026)",
    heightStoreysLine: `${height.toFixed(1)} m · Kelvin mesh (Nov 2026)`,
    footprintM2,
  };
}
