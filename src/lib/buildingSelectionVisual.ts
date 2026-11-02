import * as THREE from "three";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { CityModel } from "../types";
import { auditBuildingSelection, type BuildingSelectionAudit } from "./buildingSelectionAudit";
import type { BuildingColourMode } from "./buildingViewportColor";
import {
  createBuildingSelectionOutlineGroup,
  disposeSelectionOutlineSlot,
} from "./buildingSelectionOutline";

export type { BuildingSelectionAudit };
export { auditBuildingSelection };

export type SelectedBuildingVisual = {
  overlay: THREE.Group;
  lineMaterials: LineMaterial[];
  audit: BuildingSelectionAudit;
  restore: () => void;
};

export function mountSelectedBuildingsVisual(
  cityRoot: THREE.Object3D,
  model: CityModel,
  buildingIds: readonly number[],
  _colourMode: BuildingColourMode,
): SelectedBuildingVisual | null {
  void _colourMode;
  const uniqueIds = [...new Set(buildingIds.map((id) => Number(id)))];
  const matchedIds = uniqueIds.filter((id) => model.buildings.some((item) => item.id === id));
  if (matchedIds.length === 0) return null;
  const slot = createBuildingSelectionOutlineGroup(model, matchedIds);
  if (!slot) return null;
  const audit = auditBuildingSelection(cityRoot, matchedIds, slot.group);
  return {
    overlay: slot.group,
    lineMaterials: slot.lineMaterials,
    audit,
    restore: () => {
      disposeSelectionOutlineSlot(slot);
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

export function selectedBuildingHasOutlineAfterPick(
  cityRoot: THREE.Object3D,
  model: CityModel,
  buildingId: number,
  colourMode: BuildingColourMode,
): boolean {
  const mounted = mountSelectedBuildingVisual(cityRoot, model, buildingId, colourMode);
  if (!mounted) return false;
  const ok = mounted.audit.overlayDashedLineCount > 0;
  mounted.restore();
  return ok;
}
