import type { BuildingFeat, CityModel } from "../types";
import type { BuildingUse } from "../types";
import { buildingViewportFill, type BuildingColourMode } from "./buildingViewportColor";
import { getColour } from "./colours";
import { hexRgb } from "./lineweights";
import { isSiteBuilding } from "./siteBuildings";
import { sunStudyMutedOn } from "./sunStudyPlan";
import type { Rgb } from "./aiDocument";

export function planBuildingFill(
  model: CityModel,
  building: BuildingFeat,
  mode: BuildingColourMode,
  highlightManual: boolean,
): string {
  if (building.importedMassing) return importedMassingFill(building);
  if (highlightManual && building.heightManual) return getColour("--building-manual");
  if (isSiteBuilding(model, building.id)) return getColour("--site-building");
  return buildingViewportFill(mode, building.use as BuildingUse, building.source);
}

export function importedMassingFill(building: Pick<BuildingFeat, "importedColour">): string {
  return building.importedColour ?? getColour("--imported-massing");
}

export type PlanExportSunStudyOptions = {
  sunStudyDate?: import("./sunStudyPlan").SunStudyDate | null;
  sunStudy?: { layers: unknown[] } | null;
  sunStudyMuted?: boolean;
  sunStudySelected?: readonly number[];
};

type PlanExportBuilding = { id: number; fill: string; site: boolean };

export function sunStudyPlanExportActive(options: PlanExportSunStudyOptions): boolean {
  return Boolean(options.sunStudyDate ?? options.sunStudy);
}

export function planExportBuildingFill(
  building: PlanExportBuilding,
  options: PlanExportSunStudyOptions,
): Rgb {
  if (!sunStudyPlanExportActive(options)) return hexRgb(building.fill);
  const selected = new Set(options.sunStudySelected ?? []);
  if (selected.has(building.id) && !building.site) return hexRgb(getColour("--sun-study-sun"));
  const muted = sunStudyMutedOn(true, options.sunStudyMuted);
  if (muted && !building.site) return hexRgb(getColour("--sun-study-building"));
  return hexRgb(building.fill);
}

export function planBuildingStrokeStyle(
  style: import("./drawingStyle").LineStyles,
  uniformBuildings: boolean,
  isSite: boolean,
): import("./drawingStyle").StrokeStyle {
  if (isSite) return style.siteBuilding;
  if (uniformBuildings && !(style.building.mm > 0)) {
    return { ...style.building, mm: 0.12 };
  }
  return style.building;
}

export function importedMassingStrokeStyle(
  style: import("./drawingStyle").LineStyles,
): import("./drawingStyle").StrokeStyle {
  return { mm: Math.max(0.35, style.building.mm), color: style.building.color, dash: "1.2 0.6" };
}

export function importedMassingUpperStrokeStyle(
  style: import("./drawingStyle").LineStyles,
): import("./drawingStyle").StrokeStyle {
  const base = importedMassingStrokeStyle(style);
  return { mm: base.mm, color: base.color, dash: "none" };
}
