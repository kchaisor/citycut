import * as THREE from "three";
import type { CityModel } from "../types";
import { SELECTED_BUILDING_FILL_OPACITY, buildHeightEditOverlay, disposeObject } from "./buildCity";
import { hideBuildingForHeightEdit } from "./buildingHeightEditVisibility";
import { auditBuildingSelection, type BuildingSelectionAudit } from "./buildingSelectionAudit";
import { buildingViewportFill, type BuildingColourMode } from "./buildingViewportColor";
export { SELECTED_BUILDING_FILL_OPACITY };
export type { BuildingSelectionAudit };
export { auditBuildingSelection };

export type SelectedBuildingVisual = {
  overlay: THREE.Group;
  overlayOpacity: number;
  audit: BuildingSelectionAudit;
  restore: () => void;
};

function fillForBuilding(colourMode: BuildingColourMode, building: CityModel["buildings"][number]): string {
  return buildingViewportFill(colourMode, building.use, building.source);
}

/**
 * Hides the city mesh for one building and mounts the semi-transparent overlay with dashed edges.
 * Call restore() on deselect.
 */
export function mountSelectedBuildingVisual(
  cityRoot: THREE.Object3D,
  model: CityModel,
  buildingId: number,
  colourMode: BuildingColourMode,
): SelectedBuildingVisual | null {
  const building = model.buildings.find((item) => item.id === buildingId);
  if (!building) return null;
  const restoreHide = hideBuildingForHeightEdit(cityRoot, buildingId);
  const fill = fillForBuilding(colourMode, building);
  const overlay = buildHeightEditOverlay(model, buildingId, fill);
  if (!overlay) {
    restoreHide();
    return null;
  }
  const fillMesh = overlay.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh | undefined;
  const mat = fillMesh?.material as THREE.MeshStandardMaterial | undefined;
  const overlayOpacity = mat?.opacity ?? SELECTED_BUILDING_FILL_OPACITY;
  const audit = auditBuildingSelection(cityRoot, buildingId, overlay);
  return {
    overlay,
    overlayOpacity,
    audit,
    restore: () => {
      disposeObject(overlay);
      restoreHide();
    },
  };
}

/** Same flow as a 3D building pick after raycast resolved the id. */
export function selectedBuildingOpacityAfterPick(
  cityRoot: THREE.Object3D,
  model: CityModel,
  buildingId: number,
  colourMode: BuildingColourMode,
): number | null {
  const mounted = mountSelectedBuildingVisual(cityRoot, model, buildingId, colourMode);
  if (!mounted) return null;
  const opacity = mounted.overlayOpacity;
  mounted.restore();
  return opacity;
}
