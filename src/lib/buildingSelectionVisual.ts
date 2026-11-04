import * as THREE from "three";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { CityModel } from "../types";
import { auditBuildingSelection, type BuildingSelectionAudit } from "./buildingSelectionAudit";
import type { BuildingColourMode } from "./buildingViewportColor";
import {
  appendBuildingSelectionFillMeshes,
  createBuildingSelectionFillMaterial,
} from "./buildingSelectionFill";
import {
  createBuildingSelectionOutlineGroup,
  disposeSelectionOutlineSlot,
  type SelectionOutlineSlot,
} from "./buildingSelectionOutline";

export type { BuildingSelectionAudit };
export { auditBuildingSelection };

export type SelectedBuildingVisual = {
  overlay: THREE.Group;
  lineMaterials: LineMaterial[];
  fillMaterial: THREE.MeshStandardMaterial;
  audit: BuildingSelectionAudit;
  restore: () => void;
};

function mountSelectionOverlay(
  model: CityModel,
  buildingIds: readonly number[],
): { group: THREE.Group; slot: SelectionOutlineSlot; fillMaterial: THREE.MeshStandardMaterial } | null {
  const uniqueIds = [...new Set(buildingIds.map((id) => Number(id)))];
  const matchedIds = uniqueIds.filter((id) => model.buildings.some((item) => item.id === id));
  if (matchedIds.length === 0) return null;
  const slot = createBuildingSelectionOutlineGroup(model, matchedIds);
  if (!slot) return null;
  const fillMaterial = createBuildingSelectionFillMaterial();
  const group = new THREE.Group();
  group.name = "BuildingSelectionOutline";
  appendBuildingSelectionFillMeshes(group, model, matchedIds, fillMaterial);
  for (const child of slot.group.children) {
    group.add(child);
  }
  return { group, slot, fillMaterial };
}

export function mountSelectedBuildingsVisual(
  cityRoot: THREE.Object3D,
  model: CityModel,
  buildingIds: readonly number[],
  _colourMode: BuildingColourMode,
): SelectedBuildingVisual | null {
  void _colourMode;
  void cityRoot;
  const mounted = mountSelectionOverlay(model, buildingIds);
  if (!mounted) return null;
  const matchedIds = [...new Set(buildingIds.map((id) => Number(id)))].filter((id) =>
    model.buildings.some((item) => item.id === id),
  );
  const audit = auditBuildingSelection(cityRoot, matchedIds, mounted.group);
  return {
    overlay: mounted.group,
    lineMaterials: mounted.slot.lineMaterials,
    fillMaterial: mounted.fillMaterial,
    audit,
    restore: () => {
      mounted.fillMaterial.dispose();
      disposeSelectionOutlineSlot(mounted.slot);
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
  const ok = mounted.audit.overlayDashedLineCount > 0 && mounted.audit.selectionFillMeshCount > 0;
  mounted.restore();
  return ok;
}
