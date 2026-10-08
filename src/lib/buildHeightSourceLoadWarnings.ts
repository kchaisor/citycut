import { intersectsComCity } from "./comBuildingHeights";
import type { BBox } from "./comBuildingHeightsTypes";

export function buildHeightSourceLoadWarnings(input: {
  buildingsLayer: boolean;
  comBounds: BBox;
  comError: string | null;
  comFootprintCount: number;
  damError: string | null;
  overtureBuildingError?: string | null;
}): string[] {
  if (!input.buildingsLayer) return [];
  const warnings: string[] = [];
  if (input.comError) {
    console.warn(`[CityCut height] ${input.comError}`);
    warnings.push("CoM 2023 heights didn't load. Showing estimates.");
  } else if (intersectsComCity(input.comBounds) && input.comFootprintCount === 0) {
    console.warn("[CityCut height] CoM 2023 footprints empty for Melbourne cut.");
    warnings.push("CoM 2023 heights didn't load. Showing estimates.");
  }
  if (input.damError) {
    console.warn(`[CityCut height] ${input.damError}`);
    warnings.push("CoM development floor records didn't load. Showing estimates.");
  }
  if (input.overtureBuildingError) {
    console.warn(`[CityCut height] ${input.overtureBuildingError}`);
    warnings.push("Overture building data didn't load. Showing estimates.");
  }
  return warnings;
}
