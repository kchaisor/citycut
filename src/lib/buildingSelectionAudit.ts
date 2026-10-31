import * as THREE from "three";
import { SELECTED_BUILDING_FILL_OPACITY } from "./buildCity";

export type BuildingSelectionAudit = {
  buildingId: number;
  selectedBuildingIds?: number[];
  hiddenMeshCount: number;
  zeroedGroupCount: number;
  visibleGroupCount: number;
  overlayInScene: boolean;
  overlayFillTransparent: boolean;
  overlayFillOpacity: number;
  overlayDashedLineCount: number;
  overlayLineDistancesReady: boolean;
};

function matchesBuildingId(stored: unknown, targetIds: ReadonlySet<number>): boolean {
  if (stored == null) return false;
  return targetIds.has(Number(stored));
}

export function auditBuildingSelection(
  cityRoot: THREE.Object3D,
  buildingIdOrIds: number | readonly number[],
  overlay: THREE.Group | null,
): BuildingSelectionAudit {
  const ids = Array.isArray(buildingIdOrIds)
    ? buildingIdOrIds.map((id) => Number(id))
    : [Number(buildingIdOrIds)];
  const targetId = ids[0] ?? 0;
  const targetIds = new Set(ids);
  let hiddenMeshCount = 0;
  let zeroedGroupCount = 0;
  let visibleGroupCount = 0;

  cityRoot.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const batch = mesh.name || mesh.parent?.name || "";
    if (!batch.startsWith("Buildings") && !batch.startsWith("source:")) return;

    if (matchesBuildingId(mesh.userData.buildingId, targetIds)) {
      if (!mesh.visible) hiddenMeshCount += 1;
      return;
    }

    const byGroup = mesh.userData.buildingIdByGroup as number[] | undefined;
    const groups = mesh.geometry?.groups;
    if (!byGroup?.length || !groups?.length) return;
    for (let index = 0; index < groups.length; index++) {
      if (!matchesBuildingId(byGroup[index], targetIds)) continue;
      if (groups[index]!.count === 0) zeroedGroupCount += 1;
      else visibleGroupCount += 1;
    }
  });

  const overlayInScene = overlay != null && overlay.parent != null;
  let fillMesh: THREE.Mesh | undefined;
  const dashedLines: THREE.LineSegments[] = [];
  overlay?.traverse((child) => {
    if (!fillMesh && child instanceof THREE.Mesh) fillMesh = child;
    if (child instanceof THREE.LineSegments && child.material instanceof THREE.LineDashedMaterial) {
      dashedLines.push(child);
    }
  });
  const fillMat = fillMesh?.material as THREE.MeshStandardMaterial | undefined;
  const overlayLineDistancesReady = dashedLines.every((segments) => {
    const dist = segments.geometry.getAttribute("lineDistance");
    return dist != null && dist.count > 0;
  });

  return {
    buildingId: targetId,
    selectedBuildingIds: ids,
    hiddenMeshCount,
    zeroedGroupCount,
    visibleGroupCount,
    overlayInScene,
    overlayFillTransparent: Boolean(fillMat?.transparent),
    overlayFillOpacity: fillMat?.opacity ?? 0,
    overlayDashedLineCount: dashedLines.length,
    overlayLineDistancesReady,
  };
}

export function selectionAuditOk(audit: BuildingSelectionAudit): boolean {
  const baseHidden = audit.hiddenMeshCount > 0 || audit.zeroedGroupCount > 0;
  return (
    baseHidden &&
    audit.visibleGroupCount === 0 &&
    audit.overlayInScene &&
    audit.overlayFillTransparent &&
    Math.abs(audit.overlayFillOpacity - SELECTED_BUILDING_FILL_OPACITY) < 0.01 &&
    audit.overlayDashedLineCount > 0 &&
    audit.overlayLineDistancesReady
  );
}
