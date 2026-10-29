import * as THREE from "three";
import type { CityModel } from "../types";
import { SELECTED_BUILDING_FILL_OPACITY, buildHeightEditOverlay, disposeObject } from "./buildCity";
import { hideBuildingsForHeightEdit } from "./buildingHeightEditVisibility";
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

export function mountSelectedBuildingsVisual(
  cityRoot: THREE.Object3D,
  model: CityModel,
  buildingIds: readonly number[],
  colourMode: BuildingColourMode,
): SelectedBuildingVisual | null {
  const uniqueIds = [...new Set(buildingIds.map((id) => Number(id)))];
  const matched = uniqueIds
    .map((id) => model.buildings.find((item) => item.id === id))
    .filter((item): item is CityModel["buildings"][number] => item != null);
  if (matched.length === 0) return null;
  const matchedIds = matched.map((item) => item.id);
  const restoreHide = hideBuildingsForHeightEdit(cityRoot, matchedIds);
  const overlay = new THREE.Group();
  overlay.name = "HeightEditOverlay";
  let firstFillMesh: THREE.Mesh | undefined;
  for (const building of matched) {
    const fill = fillForBuilding(colourMode, building);
    const single = buildHeightEditOverlay(model, building.id, fill);
    if (!single) continue;
    while (single.children.length > 0) {
      const child = single.children[0]!;
      single.remove(child);
      if (!firstFillMesh && child instanceof THREE.Mesh) firstFillMesh = child;
      overlay.add(child);
    }
  }
  if (overlay.children.length === 0) {
    restoreHide();
    return null;
  }
  const mat = firstFillMesh?.material as THREE.MeshStandardMaterial | undefined;
  const overlayOpacity = mat?.opacity ?? SELECTED_BUILDING_FILL_OPACITY;
  const audit = auditBuildingSelection(cityRoot, matchedIds, overlay);
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

export function mountSelectedBuildingVisual(
  cityRoot: THREE.Object3D,
  model: CityModel,
  buildingId: number,
  colourMode: BuildingColourMode,
): SelectedBuildingVisual | null {
  return mountSelectedBuildingsVisual(cityRoot, model, [buildingId], colourMode);
}

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
